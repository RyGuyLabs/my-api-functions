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
 * - Parse fixed-width records.
 * - Normalize whitespace.
 * - Validate minimum record integrity.
 * - Bulk upsert records into the registry database.
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
 *          ↓
 * FloridaIngestionService
 *          ↓
 * FloridaRegistryDatabase
 *          ↓
 * OfficialFloridaProvider
 *          ↓
 * RegistryAcquisitionService
 */

/**
 * IMPORTANT:
 *
 * These offsets MUST correspond to the currently published
 * Florida Division of Corporations data-file specification.
 *
 * Do not modify these values based on assumptions about the
 * Sunbiz website UI.
 *
 * Fixed-width offsets are 0-indexed and the `end` position is
 * exclusive, matching String.prototype.substring().
 */
const FLORIDA_FIXED_WIDTH_SCHEMA = {
  documentNumber: {
    start: 0,
    end: 12
  },

  entityName: {
    start: 12,
    end: 204
  },

  status: {
    start: 204,
    end: 210
  },

  filingDate: {
    start: 210,
    end: 218
  },

  principalAddress: {
    start: 218,
    end: 260
  },

  principalCity: {
    start: 260,
    end: 288
  },

  principalState: {
    start: 288,
    end: 290
  },

  principalZip: {
    start: 290,
    end: 299
  },

  mailingAddress: {
    start: 299,
    end: 341
  },

  mailingCity: {
    start: 341,
    end: 369
  },

  mailingState: {
    start: 369,
    end: 371
  },

  mailingZip: {
    start: 371,
    end: 380
  }
};

class FloridaIngestionService {

  /**
   * @param {Object} options
   * @param {Object} options.database
   * @param {Object} [options.schemaSpec]
   * @param {number} [options.minimumRecordLength]
   */
  constructor({
    database,
    schemaSpec = FLORIDA_FIXED_WIDTH_SCHEMA,
    minimumRecordLength = 380
  } = {}) {

    if (
      !database ||
      typeof database.upsertBatch !== "function"
    ) {

      throw new Error(
        "FloridaIngestionService requires a database with upsertBatch()."
      );
    }

    this.database = database;

    this.schemaSpec =
      schemaSpec;

    this.minimumRecordLength =
      minimumRecordLength;
  }

  // ==========================================================================
  // FIELD NORMALIZATION
  // ==========================================================================

  normalizeValue(value) {

    if (
      value === null ||
      value === undefined
    ) {
      return null;
    }

    const normalized =
      String(value)
        .replace(/\s+/g, " ")
        .trim();

    return normalized || null;
  }

  // ==========================================================================
  // FIXED-WIDTH PARSING
  // ==========================================================================

  parseLine(line) {

    if (
      typeof line !== "string" ||
      !line.trim()
    ) {
      return null;
    }

    /*
     * A fixed-width record shorter than the expected schema is
     * potentially truncated or malformed.
     *
     * Do NOT silently construct a partial authoritative record.
     */
    if (
      line.length <
      this.minimumRecordLength
    ) {
      return null;
    }

    const record = {};

    for (
      const [field, definition]
      of Object.entries(this.schemaSpec)
    ) {

      const {
        start,
        end
      } = definition;

      if (
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        start < 0 ||
        end <= start
      ) {

        throw new Error(
          `Invalid fixed-width schema definition for field "${field}".`
        );
      }

      const rawValue =
        line.substring(
          start,
          end
        );

      record[field] =
        this.normalizeValue(
          rawValue
        );
    }

    /*
     * These fields establish the minimum identity
     * required for an authoritative corporate record.
     */
    if (
      !record.documentNumber ||
      !record.entityName
    ) {
      return null;
    }

    /*
     * Normalize known jurisdiction data.
     */
    if (
      record.principalState
    ) {
      record.principalState =
        record.principalState
          .toUpperCase();
    }

    if (
      record.mailingState
    ) {
      record.mailingState =
        record.mailingState
          .toUpperCase();
    }

    /*
     * Preserve the original YYYYMMDD value unless
     * the database layer explicitly requires a Date.
     *
     * We do not reinterpret official source values here.
     */
    return record;
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

    for await (
      const line of rl
    ) {

      linesRead++;

      const record =
        this.parseLine(
          line
        );

      if (!record) {

        rejectedRecords++;

        continue;
      }

      validRecords++;

      batch.push(
        record
      );

      if (
        batch.length >=
        batchSize
      ) {

        const insertedCount =
          await this.database.upsertBatch(
            batch
          );

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

      const insertedCount =
        await this.database.upsertBatch(
          batch
        );

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

      sourceFile:
        path.basename(
          absolutePath
        ),

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

    /*
     * Manifest recording is intentionally separate from
     * prospect-level evidence.
     *
     * This records the provenance of the dataset ingestion
     * itself.
     */
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
}

module.exports = {
  FloridaIngestionService,
  FLORIDA_FIXED_WIDTH_SCHEMA
};
