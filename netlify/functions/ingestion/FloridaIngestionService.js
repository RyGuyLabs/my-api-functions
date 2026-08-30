// netlify/functions/ingestion/FloridaIngestionService.js
const fs = require("fs");
const readline = require("readline");
const path = require("path");
const crypto = require("crypto");

/**
 * FloridaIngestionService
 *
 * Ingests official Florida Division of Corporations fixed-width
 * registry files into the local corporate-registry database.
 *
 * RESPONSIBILITY:
 * - Read official registry files.
 * - Validate exact 1,440-byte record boundaries.
 * - Delegate record parsing and normalization to CordataProvider (ESM).
 * - Adapt provider lead models into FloridaRegistryDatabase bundle format.
 * - Bulk-upsert parsed entities, raw lines, and officer/people data via atomic transaction.
 * - Produce an auditable ingestion manifest.
 */
class FloridaIngestionService {
  /**
   * @param {Object} options
   * @param {Object} options.database
   * @param {Object} [options.provider] - Optional pre-initialized CordataProvider instance
   * @param {number} [options.expectedRecordLength]
   */
  constructor({
    database,
    provider = null,
    expectedRecordLength = 1440
  } = {}) {
    if (
      !database ||
      (typeof database.upsertFullRecordBatch !== "function" &&
        typeof database.upsertBatch !== "function")
    ) {
      throw new Error(
        "FloridaIngestionService requires a database with upsertFullRecordBatch() or upsertBatch()."
      );
    }

    this.database = database;
    this.provider = provider;
    this.expectedRecordLength = expectedRecordLength;
  }

  /**
   * Lazily loads and caches the ESM CordataProvider module instance.
   * Avoids repeated dynamic import calls per record.
   *
   * @returns {Promise<Object>} The cached CordataProvider instance.
   */
  async getProvider() {
    if (!this.provider) {
      const { CordataProvider } = await import("../Cordata/CordataProvider.js");
      this.provider = new CordataProvider();
    }
    return this.provider;
  }

  /**
   * Adapts a CordataProvider lead object into the bundle contract expected
   * by FloridaRegistryDatabase.upsertFullRecordBatch().
   *
   * Note: Provider-only metadata (classificationCode, feiNumber, feiStatusRaw, jurisdictionCode)
   * is attached to `parsed` for diagnostic visibility, but FloridaRegistryDatabase.toDatabaseRecord()
   * does not currently persist those 4 specific fields.
   *
   * @param {Object} lead - Output from CordataProvider.processRecord()
   * @param {string} rawLine - The raw 1,440-character line string
   * @returns {Object} Bundle containing { parsed, raw, people }
   */
  adaptLeadToBundle(lead, rawLine) {
    const entity = lead.entity || {};
    const addresses = lead.addresses || {};
    const principal = addresses.principal || {};
    const mailing = addresses.mailing || {};

    const parsed = {
      registrationId: entity.documentNumber,
      companyName: entity.legalName,
      formationDate: entity.filingDate || null,
      entityType: null,
      status: null,
      principalAddress: {
        line1: principal.address1 || null,
        line2: null,
        city: principal.city || null,
        state: principal.state || null,
        zip: principal.zip || null
      },
      mailingAddress: {
        line1: mailing.address1 || null,
        line2: null,
        city: mailing.city || null,
        state: mailing.state || null,
        zip: mailing.zip || null
      },
      // Provider-only metadata preserved for diagnostics
      classificationCode: entity.classificationCode || null,
      feiNumber: entity.feiNumber || null,
      feiStatusRaw: entity.feiStatusRaw || null,
      jurisdictionCode: entity.jurisdictionCode || null
    };

    const people = (lead.officers || [])
      .map((officer) => {
        const nameParts = [officer.firstName, officer.lastNameOrOrg].filter(Boolean);
        const fullName = nameParts.join(" ").trim() || officer.rawIdentifier || null;

        return {
          title: officer.role || null,
          name: fullName,
          address: {
            line1: officer.street || null,
            line2: null,
            city: officer.city || null,
            state: officer.state || null,
            zip: officer.zip || null
          }
        };
      })
      .filter((person) => Boolean(person.name));

    return {
      parsed,
      raw: rawLine,
      people
    };
  }

  /**
   * Validates exact 1,440-character record boundary, delegates parsing to CordataProvider,
   * validates output, and adapts to the database bundle format.
   *
   * @param {string} line
   * @param {Object} provider - Cached CordataProvider instance
   * @returns {Object|null} Bundle record containing { parsed, raw, people } or null if invalid.
   */
  parseLine(line, provider) {
    if (typeof line !== "string" || !line.trim()) {
      return null;
    }

    // Require exactly 1,440 bytes for the state fixed-width specification.
    if (Buffer.byteLength(line, 'utf8') !== this.expectedRecordLength) {
      return null;
    }

    try {
      const lead = provider.processRecord(line);

      if (
        !lead ||
        !lead.entity ||
        !lead.entity.documentNumber ||
        !lead.entity.legalName
      ) {
        return null;
      }

      return this.adaptLeadToBundle(lead, line);
    } catch (err) {
      return null;
    }
  }

  // ==========================================================================
  // FILE HASH
  // ==========================================================================

  async calculateFileHash(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash("sha256");
      const stream = fs.createReadStream(filePath);

      stream.on("data", (chunk) => hash.update(chunk));
      stream.on("error", reject);
      stream.on("end", () => {
        resolve(hash.digest("hex"));
      });
    });
  }

  // ==========================================================================
  // FILE INGESTION
  // ==========================================================================

  async processFile(
    filePath,
    { batchSize = 2500, acquisitionType = "daily_delta" } = {}
  ) {
    if (typeof filePath !== "string" || !filePath.trim()) {
      throw new Error("FloridaIngestionService requires a valid file path.");
    }

    if (!fs.existsSync(filePath)) {
      throw new Error(`Target file does not exist: ${filePath}`);
    }

    if (!Number.isInteger(batchSize) || batchSize < 1) {
      throw new Error("batchSize must be a positive integer.");
    }

    const allowedAcquisitionTypes = ["quarterly_master", "daily_delta"];

    if (!allowedAcquisitionTypes.includes(acquisitionType)) {
      throw new Error(`Unsupported acquisitionType: ${acquisitionType}`);
    }

    const startTime = Date.now();
    const absolutePath = path.resolve(filePath);
    const fileStats = fs.statSync(absolutePath);
    const fileHash = await this.calculateFileHash(absolutePath);

    // Initialize provider instance once for the entire run
    const provider = await this.getProvider();

    const fileStream = fs.createReadStream(absolutePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let batch = [];
    let linesRead = 0;
    let validRecords = 0;
    let rejectedRecords = 0;
    let recordsIngested = 0;

    const sourceFileName = path.basename(absolutePath);

    for await (const line of rl) {
      linesRead++;

      const recordBundle = this.parseLine(line, provider);

      if (!recordBundle) {
        rejectedRecords++;
        continue;
      }

      // Attach source metadata to entity record prior to database commit
      recordBundle.parsed.source = {
        file: sourceFileName,
        sourceType: "official_state_dataset",
        retrievedAt: new Date().toISOString()
      };

      validRecords++;
      batch.push(recordBundle);

      if (batch.length >= batchSize) {
        const insertedCount = await this.commitBatch(batch);
        recordsIngested += Number(insertedCount) || 0;
        batch = [];
      }
    }

    // Final batch
    if (batch.length > 0) {
      const insertedCount = await this.commitBatch(batch);
      recordsIngested += Number(insertedCount) || 0;
    }

    const executionTimeSeconds = Number(
      ((Date.now() - startTime) / 1000).toFixed(2)
    );

    const manifest = {
      source: "Florida Division of Corporations",
      acquisitionType,
      sourceFile: sourceFileName,
      sourcePath: absolutePath,
      fileSizeBytes: fileStats.size,
      sourceFileSha256: fileHash,
      retrievedAt: new Date().toISOString(),
      linesRead,
      validRecords,
      rejectedRecords,
      recordsIngested,
      executionTimeSeconds,
      status: "success"
    };

    if (typeof this.database.recordIngestionManifest === "function") {
      await this.database.recordIngestionManifest(manifest);
    }

    return manifest;
  }

  /**
   * Commits batch using database transaction methods.
   *
   * @param {Array<Object>} batch
   * @returns {Promise<number>} Number of records ingested.
   */
  async commitBatch(batch) {
    if (typeof this.database.upsertFullRecordBatch === "function") {
      return await this.database.upsertFullRecordBatch(batch);
    }

    // Fallback if raw/people structures aren't accepted by traditional upsertBatch
    const parsedOnly = batch.map((item) => item.parsed);
    return await this.database.upsertBatch(parsedOnly);
  }
}

module.exports = {
  FloridaIngestionService
};
