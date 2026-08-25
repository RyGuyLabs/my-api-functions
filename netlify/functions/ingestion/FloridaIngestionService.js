const fs = require("fs");
const readline = require("readline");
const path = require("path");
const crypto = require("crypto");
const { CordataParser } = require("./CordataParser");

/**
 * FloridaIngestionService
 *
 * Ingests official Florida Division of Corporations fixed-width
 * registry files into the local corporate-registry database.
 *
 * RESPONSIBILITY:
 * - Read official registry files.
 * - Validate 1,440-byte record boundaries.
 * - Delegate record parsing to CordataParser.
 * - Normalize whitespace and record attributes.
 * - Bulk-upsert parsed entities, raw lines, and officer/people data into the database via atomic transaction.
 * - Produce an auditable ingestion manifest.
 *
 * DOES NOT:
 * - Search the registry.
 * - Interpret user intent.
 * - Discover businesses.
 * - Enrich businesses.
 * - Qualify leads.
 * - Score prospects.
 * - Write prospect-level Evidence Ledger observations.
 *
 * ARCHITECTURAL ROLE:
 *
 * Florida Official Data Files
 *           ↓
 * FloridaIngestionService
 *           ↓
 * FloridaRegistryDatabase
 *           ↓
 * OfficialFloridaProvider
 *           ↓
 * RegistryAcquisitionService
 */

class FloridaIngestionService {

  /**
   * @param {Object} options
   * @param {Object} options.database
   * @param {CordataParser} [options.parser]
   * @param {number} [options.expectedRecordLength]
   */
  constructor({
    database,
    parser = new CordataParser(),
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
    this.parser = parser;
    this.expectedRecordLength = expectedRecordLength;
  }

  // ==========================================================================
  // BOUNDARY VALIDATION & RECORD PARSING
  // ==========================================================================

  /**
   * Validates 1,440-byte record boundary and delegates to CordataParser.
   *
   * @param {string} line
   * @returns {Object|null} Bundle record containing { parsed, raw, people } or null if invalid.
   */
  parseLine(line) {

    if (
      typeof line !== "string" ||
      !line.trim()
    ) {
      return null;
    }

    /*
     * Validate exact/minimum record boundary to ensure we don't process
     * truncated fixed-width state lines.
     */
    if (line.length < this.expectedRecordLength) {
      return null;
    }

    try {
      const parsedRecord = this.parser.parseLine(line);

      if (
        !parsedRecord ||
        !parsedRecord.registrationId ||
        !parsedRecord.companyName
      ) {
        return null;
      }

      return {
        parsed: parsedRecord,
        raw: line,
        people: parsedRecord.people || []
      };
    } catch (err) {
      return null;
    }
  }

  // ==========================================================================
  // FILE HASH
  // ==========================================================================

  async calculateFileHash(filePath) {

    return new Promise(
      (resolve, reject) => {

        const hash =
          crypto.createHash("sha256");

        const stream =
          fs.createReadStream(
            filePath
          );

        stream.on(
          "data",
          chunk => hash.update(chunk)
        );

        stream.on(
          "error",
          reject
        );

        stream.on(
          "end",
          () => {
            resolve(
              hash.digest("hex")
            );
          }
        );
      }
    );
  }

  // ==========================================================================
  // FILE INGESTION
  // ==========================================================================

  async processFile(
    filePath,
    {
      batchSize = 2500,
      acquisitionType = "daily_delta"
    } = {}
  ) {

    if (
      typeof filePath !== "string" ||
      !filePath.trim()
    ) {

      throw new Error(
        "FloridaIngestionService requires a valid file path."
      );
    }

    if (
      !fs.existsSync(filePath)
    ) {

      throw new Error(
        `Target file does not exist: ${filePath}`
      );
    }

    if (
      !Number.isInteger(batchSize) ||
      batchSize < 1
    ) {

      throw new Error(
        "batchSize must be a positive integer."
      );
    }

    const allowedAcquisitionTypes = [
      "quarterly_master",
      "daily_delta"
    ];

    if (
      !allowedAcquisitionTypes.includes(
        acquisitionType
      )
    ) {

      throw new Error(
        `Unsupported acquisitionType: ${acquisitionType}`
      );
    }

    const startTime =
      Date.now();

    const absolutePath =
      path.resolve(filePath);

    const fileStats =
      fs.statSync(
        absolutePath
      );

    const fileHash =
      await this.calculateFileHash(
        absolutePath
      );

    const fileStream =
      fs.createReadStream(
        absolutePath
      );

    const rl =
      readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });

    let batch = [];

    let linesRead = 0;
    let validRecords = 0;
    let rejectedRecords = 0;
    let recordsIngested = 0;

    const sourceFileName = path.basename(absolutePath);

    for await (
      const line of rl
    ) {

      linesRead++;

      const recordBundle =
        this.parseLine(
          line
        );

      if (!recordBundle) {

        rejectedRecords++;

        continue;
      }

      // Attach source metadata to entity record
      recordBundle.parsed.source = {
        file: sourceFileName,
        sourceType: "official_state_dataset",
        retrievedAt: new Date().toISOString()
      };

      validRecords++;

      batch.push(
        recordBundle
      );

      if (
        batch.length >=
        batchSize
      ) {

        const insertedCount = await this.commitBatch(batch);

        recordsIngested +=
          Number(insertedCount) || 0;

        batch = [];
      }
    }

    // ------------------------------------------------------------------------
    // FINAL BATCH
    // ------------------------------------------------------------------------

    if (
      batch.length > 0
    ) {

      const insertedCount = await this.commitBatch(batch);

      recordsIngested +=
        Number(insertedCount) || 0;
    }

    const executionTimeSeconds =
      Number(
        (
          (Date.now() - startTime) /
          1000
        ).toFixed(2)
      );

    // ==========================================================================
    // INGESTION MANIFEST
    // ==========================================================================

    const manifest = {

      source:
        "Florida Division of Corporations",

      acquisitionType,

      sourceFile: sourceFileName,

      sourcePath:
        absolutePath,

      fileSizeBytes:
        fileStats.size,

      sourceFileSha256:
        fileHash,

      retrievedAt:
        new Date().toISOString(),

      linesRead,

      validRecords,

      rejectedRecords,

      recordsIngested,

      executionTimeSeconds,

      status:
        "success"
    };

    if (
      typeof this.database
        .recordIngestionManifest ===
      "function"
    ) {

      await this.database
        .recordIngestionManifest(
          manifest
        );
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
    const parsedOnly = batch.map(item => item.parsed);
    return await this.database.upsertBatch(parsedOnly);
  }
}

module.exports = {
  FloridaIngestionService
};
