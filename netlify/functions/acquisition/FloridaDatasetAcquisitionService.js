// FloridaDatasetAcquisitionService.js
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const crypto = require("crypto");
const { URL } = require("url");

const DEFAULT_SOURCE_URLS = {
  quarterly_master:
    process.env.FLORIDA_MASTER_DATASET_URL ||
    "https://dos.myflorida.com/media/sunbiz/corpmaster.zip",
  daily_delta:
    process.env.FLORIDA_DAILY_DATASET_URL ||
    "https://dos.myflorida.com/media/sunbiz/corpdelta.txt"
};

class FloridaDatasetAcquisitionService {
  constructor({
    storageDirectory =
      process.env.FLORIDA_DATASET_STORAGE_DIR ||
      path.join(process.cwd(), "data", "raw", "florida"),
    sourceUrls = DEFAULT_SOURCE_URLS,
    timeoutMs = 30000,
    maxRedirects = 5
  } = {}) {
    this.name = "FloridaDatasetAcquisitionService";
    this.storageDirectory = path.resolve(storageDirectory);
    this.sourceUrls = { ...DEFAULT_SOURCE_URLS, ...sourceUrls };
    this.timeoutMs = timeoutMs;
    this.maxRedirects = maxRedirects;

    this.ensureStorageDirectoryExists();
  }

  ensureStorageDirectoryExists() {
    if (!fs.existsSync(this.storageDirectory)) {
      fs.mkdirSync(this.storageDirectory, { recursive: true });
    }
  }

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

    const startTime = Date.now();
    const sourceUrl = customSourceUrl || this.sourceUrls[acquisitionType];

    if (!sourceUrl) {
      throw new Error(`No source URL available for acquisitionType: ${acquisitionType}`);
    }

    this.ensureStorageDirectoryExists();

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const defaultFileName =
      outputFileName ||
      `florida_${acquisitionType}_${timestamp}${path.extname(sourceUrl) || ".txt"}`;
    const destinationPath = path.join(this.storageDirectory, defaultFileName);

    const isLocal = sourceUrl.startsWith("file://") || fs.existsSync(sourceUrl);

    let result;
    if (isLocal) {
      result = await this.copyLocalFile(sourceUrl, destinationPath);
    } else {
      result = await this.downloadFile(sourceUrl, destinationPath);
    }

    const executionTimeSeconds = Number(((Date.now() - startTime) / 1000).toFixed(2));

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

  async copyLocalFile(sourcePath, destinationPath) {
    const resolvedSource = sourcePath.replace(/^file:\/\//, "");

    if (!fs.existsSync(resolvedSource)) {
      throw new Error(`Local source file does not exist: ${sourcePath}`);
    }

    const cleanupPartial = () => {
      if (fs.existsSync(destinationPath)) {
        try {
          fs.unlinkSync(destinationPath);
        } catch (_) {}
      }
    };

    return new Promise((resolve, reject) => {
      const hash = crypto.createHash("sha256");
      const readStream = fs.createReadStream(resolvedSource);
      const writeStream = fs.createWriteStream(destinationPath);
      let fileSizeBytes = 0;

      readStream.on("data", (chunk) => {
        hash.update(chunk);
        fileSizeBytes += chunk.length;
      });

      readStream.on("error", (err) => {
        writeStream.destroy();
        cleanupPartial();
        reject(err);
      });

      writeStream.on("error", (err) => {
        readStream.destroy();
        cleanupPartial();
        reject(err);
      });

      writeStream.on("finish", () => {
        if (fileSizeBytes === 0) {
          cleanupPartial();
          return reject(new Error("Local source file is empty (0 bytes)."));
        }
        resolve({
          fileSizeBytes,
          sha256: hash.digest("hex")
        });
      });

      readStream.pipe(writeStream);
    });
  }

  downloadFile(currentUrl, destinationPath, redirectCount = 0) {
    return new Promise((resolve, reject) => {
      let isSettled = false;

      const cleanupPartial = () => {
        if (fs.existsSync(destinationPath)) {
          try {
            fs.unlinkSync(destinationPath);
          } catch (_) {}
        }
      };

      const fail = (err) => {
        if (isSettled) return;
        isSettled = true;
        cleanupPartial();
        reject(err);
      };

      let parsedUrl;
      try {
        parsedUrl = new URL(currentUrl);
      } catch (err) {
        return fail(new Error(`Invalid URL format: ${currentUrl}`));
      }

      const transport = parsedUrl.protocol === "https:" ? https : http;

      const req = transport.get(parsedUrl, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
          if (redirectCount >= this.maxRedirects) {
            res.resume();
            return fail(
              new Error(`Exceeded maximum redirect limit of ${this.maxRedirects}`)
            );
          }

          const redirectLocation = res.headers.location;
          if (!redirectLocation) {
            res.resume();
            return fail(
              new Error(`Redirect response missing Location header (HTTP ${res.statusCode})`)
            );
          }
          res.resume();
          const nextUrl = new URL(redirectLocation, currentUrl).toString();
          isSettled = true;
          return resolve(this.downloadFile(nextUrl, destinationPath, redirectCount + 1));
        }

        if (res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          return fail(new Error(`HTTP request failed with status code ${res.statusCode}`));
        }

        const contentType = (res.headers["content-type"] || "").toLowerCase();
        if (contentType.includes("text/html")) {
          res.resume();
          return fail(new Error("Remote source returned HTML content-type response"));
        }

        const hash = crypto.createHash("sha256");
        const writeStream = fs.createWriteStream(destinationPath);
        let totalBytes = 0;
        let isFirstChunk = true;

        writeStream.on("drain", () => {
          if (!isSettled) {
            res.resume();
          }
        });

        res.on("data", (chunk) => {
          if (isSettled) return;

          if (isFirstChunk) {
            isFirstChunk = false;
            const snippet = chunk.slice(0, 512).toString("utf8").trim().toLowerCase();
            if (snippet.startsWith("<!doctype html") || snippet.startsWith("<html")) {
              req.destroy();
              res.destroy();
              writeStream.destroy();
              return fail(new Error("HTML content detected during response sniffing"));
            }
          }

          totalBytes += chunk.length;
          hash.update(chunk);

          const canContinue = writeStream.write(chunk);
          if (!canContinue) {
            res.pause();
          }
        });

        res.on("end", () => {
          if (!isSettled) {
            writeStream.end();
          }
        });

        res.on("error", (err) => {
          writeStream.destroy();
          fail(err);
        });

        writeStream.on("finish", () => {
          if (isSettled) return;
          if (totalBytes === 0) {
            return fail(new Error("Zero-byte file payload received"));
          }
          isSettled = true;
          resolve({
            fileSizeBytes: totalBytes,
            sha256: hash.digest("hex")
          });
        });

        writeStream.on("error", (err) => {
          fail(err);
        });
      });

      req.setTimeout(this.timeoutMs, () => {
        req.destroy();
        fail(new Error(`Request timed out after ${this.timeoutMs}ms`));
      });

      req.on("error", (err) => {
        fail(err);
      });
    });
  }
}

module.exports = {
  FloridaDatasetAcquisitionService
};
