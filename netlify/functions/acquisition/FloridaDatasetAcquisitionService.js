const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const http = require("http");
const https = require("https");

/**
 * FloridaDatasetAcquisitionService
 *
 * Handles acquisition of bulk Florida Division of Corporations datasets.
 *
 * RESPONSIBILITY:
 * - Download official state corporate data files (Master / Delta).
 * - Compute SHA-256 integrity hashes on the fly.
 * - Store raw files safely in local dataset storage.
 * - Return standardized acquisition metadata for downstream ingestion.
 *
 * DOES NOT:
 * - Search the registry or perform natural-language queries.
 * - Parse fixed-width record contents (delegated to FloridaIngestionService).
 * - Interpret business intent or enrich entity records.
 * - Interact directly with database storage.
 *
 * ARCHITECTURAL ROLE:
 *
 * Official State Data (HTTP/FTP/URL)
 *           ↓
 * FloridaDatasetAcquisitionService  <-- (YOU ARE HERE)
 *           ↓
 * FloridaIngestionService
 *           ↓
 * FloridaRegistryDatabase
 */

const DEFAULT_SOURCE_URLS = {
  quarterly_master:
    process.env.FLORIDA_MASTER_DATASET_URL ||
    "https://dos.myflorida.com/media/sunbiz/corpmaster.zip",

  daily_delta:
    process.env.FLORIDA_DAILY_DATASET_URL ||
    "https://dos.myflorida.com/media/sunbiz/corpdelta.txt"
};

class FloridaDatasetAcquisitionService {

  /**
   * @param {Object} [options]
   * @param {string} [options.storageDirectory] Target folder to save raw state files.
   * @param {Object} [options.sourceUrls] Custom URL overrides for state dataset endpoints.
   */
  constructor({
    storageDirectory =
      process.env.FLORIDA_DATASET_STORAGE_DIR ||
      path.join(process.cwd(), "data", "raw", "florida"),

    sourceUrls = DEFAULT_SOURCE_URLS
  } = {}) {

    this.name = "FloridaDatasetAcquisitionService";

    this.storageDirectory = path.resolve(storageDirectory);

    this.sourceUrls = {
      ...DEFAULT_SOURCE_URLS,
      ...sourceUrls
    };

    this.ensureStorageDirectoryExists();
  }

  // ==========================================================================
  // DIRECTORY INITIALIZATION
  // ==========================================================================

  ensureStorageDirectoryExists() {
    fs.mkdirSync(this.storageDirectory, { recursive: true });
  }

  // ==========================================================================
  // MAIN ACQUISITION ENTRY POINT
  // ==========================================================================

  /**
   * Acquires a Florida corporate registry dataset file from an official source endpoint or local path override.
   *
   * @param {Object} params
   * @param {('quarterly_master'|'daily_delta')} [params.acquisitionType='daily_delta']
   * @param {string} [params.customSourceUrl] Override URL or file path for direct download.
   * @param {string} [params.outputFileName] Custom output file name.
   * @returns {Promise<Object>} Dataset acquisition metadata bundle.
   */
  async acquireDataset({
    acquisitionType = "daily_delta",
    customSourceUrl = null,
    outputFileName = null
  } = {}) {

    const allowedTypes = ["quarterly_master", "daily_delta"];

    if (!allowedTypes.includes(acquisitionType)) {
      throw new Error(
        `Unsupported acquisitionType "${acquisitionType}". Expected one of: ${allowedTypes.join(", ")}`
      );
    }

    const sourceUrl =
      customSourceUrl || this.sourceUrls[acquisitionType];

    if (!sourceUrl || typeof sourceUrl !== "string") {
      throw new Error(
        `No valid target URL or path configured for acquisition type "${acquisitionType}".`
      );
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    const defaultFileName =
      outputFileName ||
      `florida_${acquisitionType}_${timestamp}${path.extname(sourceUrl) || ".txt"}`;

    const destinationPath = path.join(this.storageDirectory, defaultFileName);

    const startTime = Date.now();

    let result;

    if (sourceUrl.startsWith("http://") || sourceUrl.startsWith("https://")) {
      result = await this.downloadFile(sourceUrl, destinationPath);
    } else {
      result = await this.copyLocalFile(sourceUrl, destinationPath);
    }

    const executionTimeSeconds = Number(
      ((Date.now() - startTime) / 1000).toFixed(2)
    );

    return {
      source: "Florida Division of Corporations",
      acquisitionType,
      sourceUrl,
      localFilePath: destinationPath,
      fileName: defaultFileName,
      fileSizeBytes: result.fileSizeBytes,
      sourceFileSha256: result.sha256,
      retrievedAt: new Date().toISOString(),
      executionTimeSeconds,
      status: "acquired"
    };
  }

  // ==========================================================================
  // FILE DOWNLOAD & HASH STREAMING
  // ==========================================================================

  /**
   * Downloads remote URL to local disk while calculating SHA-256 on the fly.
   */
  async downloadFile(url, destinationPath) {
    return new Promise((resolve, reject) => {

      const client = url.startsWith("https://") ? https : http;

      client.get(url, (response) => {

        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          return this.downloadFile(response.headers.location, destinationPath)
            .then(resolve)
            .catch(reject);
        }

        if (response.statusCode !== 200) {
          return reject(
            new Error(
              `Failed to download Florida dataset. Remote HTTP Status: ${response.statusCode}`
            )
          );
        }

        const hash = crypto.createHash("sha256");
        const fileStream = fs.createWriteStream(destinationPath);
        let fileSizeBytes = 0;

        response.on("data", (chunk) => {
          hash.update(chunk);
          fileSizeBytes += chunk.length;
        });

        response.pipe(fileStream);

        fileStream.on("finish", () => {
          fileStream.close(() => {
            resolve({
              fileSizeBytes,
              sha256: hash.digest("hex")
            });
          });
        });

        fileStream.on("error", (err) => {
          fs.unlink(destinationPath, () => {});
          reject(err);
        });

        response.on("error", (err) => {
          fs.unlink(destinationPath, () => {});
          reject(err);
        });

      }).on("error", reject);
    });
  }

  // ==========================================================================
  // LOCAL FILE COPY & HASH STREAMING
  // ==========================================================================

  /**
   * Handles local file source overrides (e.g. mock state dumps or local mirrors).
   */
  async copyLocalFile(sourcePath, destinationPath) {
    const resolvedSource = path.resolve(sourcePath);

    if (!fs.existsSync(resolvedSource)) {
      throw new Error(`Source file does not exist: ${resolvedSource}`);
    }

    return new Promise((resolve, reject) => {
      const hash = crypto.createHash("sha256");
      const readStream = fs.createReadStream(resolvedSource);
      const writeStream = fs.createWriteStream(destinationPath);
      let fileSizeBytes = 0;

      readStream.on("data", (chunk) => {
        hash.update(chunk);
        fileSizeBytes += chunk.length;
      });

      readStream.pipe(writeStream);

      writeStream.on("finish", () => {
        writeStream.close(() => {
          resolve({
            fileSizeBytes,
            sha256: hash.digest("hex")
          });
        });
      });

      readStream.on("error", reject);
      writeStream.on("error", reject);
    });
  }
}

module.exports = {
  FloridaDatasetAcquisitionService
};
