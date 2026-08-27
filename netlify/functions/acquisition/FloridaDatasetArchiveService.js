// netlify/functions/acquisition/FloridaDatasetArchiveService.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');
const unzipper = require('unzipper');

class FloridaDatasetArchiveService {
  constructor({
    maxArchiveSizeBytes = 500 * 1024 * 1024, // 500MB default archive size limit
    maxFileSizeBytes = 1000 * 1024 * 1024   // 1GB default uncompressed size limit
  } = {}) {
    this.maxArchiveSizeBytes = maxArchiveSizeBytes;
    this.maxFileSizeBytes = maxFileSizeBytes;
  }

  async calculateSha256(filePath) {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    await pipeline(stream, hash);
    return hash.digest('hex');
  }

  validateZipSignature(filePath) {
    const buffer = Buffer.alloc(4);
    const fd = fs.openSync(filePath, 'r');
    try {
      fs.readSync(fd, buffer, 0, 4, 0);
    } finally {
      fs.closeSync(fd);
    }

    // Signatures:
    // PK\x03\x04 (0x04034b50) Local file header
    // PK\x05\x06 (0x06054b50) End of central directory record
    // PK\x07\x08 (0x08074b50) Data descriptor
    const isLocalHeader = buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
    const isEocd = buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x05 && buffer[3] === 0x06;
    const isDataDescriptor = buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x07 && buffer[3] === 0x08;

    return isLocalHeader || isEocd || isDataDescriptor;
  }

  isPathTraversalOrUnsafe(entryPath, mode) {
    if (!entryPath) return true;

    // Check for symlinks/links in ZIP mode if available (0120000 bitmask for symlink in unix permissions)
    if (
  mode &&
  (mode & 0o170000) === 0o120000
) {
  return true;
}

    const normalized = entryPath.replace(/\\/g, '/');

    // Reject absolute paths
    if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
      return true;
    }

    // Split segments and verify no '..' exists
    const segments = normalized.split('/');
    if (segments.includes('..')) {
      return true;
    }

    return false;
  }

  async extractArchive(zipFilePath, outputDirectory) {
    if (!fs.existsSync(zipFilePath)) {
      throw new Error(`Archive file does not exist at path: ${zipFilePath}`);
    }

    const stats = fs.statSync(zipFilePath);
    if (!stats.isFile()) {
      throw new Error(`Archive path exists but is not a regular file: ${zipFilePath}`);
    }

    if (stats.size > this.maxArchiveSizeBytes) {
      throw new Error(`Archive size (${stats.size} bytes) exceeds limit of ${this.maxArchiveSizeBytes} bytes.`);
    }

    if (!this.validateZipSignature(zipFilePath)) {
      throw new Error('Invalid ZIP magic signature. File is not a valid ZIP archive or HTML masquerading as ZIP.');
    }

    let directory;
    try {
      directory = await unzipper.Open.file(zipFilePath);
    } catch (err) {
      throw new Error(`Failed to open ZIP archive: ${err.message}`);
    }

    if (!directory.files || directory.files.length === 0) {
      throw new Error('ZIP archive is empty or contains no files.');
    }

    // Validate ALL entries for safety first
    for (const entry of directory.files) {
      if (this.isPathTraversalOrUnsafe(entry.path, entry.mode)) {
        throw new Error(`Unsafe entry path or symlink detected in archive: ${entry.path}`);
      }
    }

    // Filter candidate data files (.txt or .dat) excluding directory entries
    const candidateFiles = directory.files.filter(entry => {
      if (entry.type === 'Directory') return false;
      const ext = path.extname(entry.path).toLowerCase();
      return ext === '.txt' || ext === '.dat';
    });

    if (candidateFiles.length === 0) {
      throw new Error('No eligible registry data file (.txt or .dat) found in archive.');
    }

    if (candidateFiles.length > 1) {
      throw new Error(`Ambiguous archive containing ${candidateFiles.length} eligible data files. Expected exactly 1.`);
    }

    const targetEntry = candidateFiles[0];

    // Check declared uncompressed size limit
    if (targetEntry.uncompressedSize && targetEntry.uncompressedSize > this.maxFileSizeBytes) {
      throw new Error(`Declared uncompressed file size (${targetEntry.uncompressedSize} bytes) exceeds maximum limit of ${this.maxFileSizeBytes} bytes.`);
    }

    // Compute original archive SHA-256
    const archiveFileSha256 = await this.calculateSha256(zipFilePath);

fs.mkdirSync(outputDirectory, {
  recursive: true
});

const safeFileName = path.basename(targetEntry.path);
    const extractedFilePath = path.join(outputDirectory, safeFileName);

    // Verify safe containment
    // Verify safe containment
const resolvedOutDir = path.resolve(outputDirectory);
const resolvedExtractedPath = path.resolve(extractedFilePath);

const relativeDestination = path.relative(
  resolvedOutDir,
  resolvedExtractedPath
);

if (
  relativeDestination.startsWith("..") ||
  path.isAbsolute(relativeDestination)
) {
  throw new Error(
    "Destination path security error: path resolves outside output directory."
  );
}

    // Stream extraction with byte counter limit validation
    let extractedByteCount = 0;
    const maxLimit = this.maxFileSizeBytes;

    const countTransform = new (require('stream').Transform)({
      transform(chunk, encoding, callback) {
        extractedByteCount += chunk.length;
        if (extractedByteCount > maxLimit) {
          return callback(new Error(`Extraction aborted: Actual file size exceeded maximum limit of ${maxLimit} bytes.`));
        }
        callback(null, chunk);
      }
    });

    try {
      const readStream = targetEntry.stream();
      const writeStream = fs.createWriteStream(extractedFilePath);

      await pipeline(readStream, countTransform, writeStream);
    } catch (err) {
      if (fs.existsSync(extractedFilePath)) {
        try { fs.unlinkSync(extractedFilePath); } catch (_) {}
      }
      throw err;
    }

    const extractedStats = fs.statSync(extractedFilePath);
    if (extractedStats.size === 0) {
      if (fs.existsSync(extractedFilePath)) {
        try { fs.unlinkSync(extractedFilePath); } catch (_) {}
      }
      throw new Error('Extracted file is 0 bytes.');
    }

    const extractedFileSha256 = await this.calculateSha256(extractedFilePath);

    return {
      archiveFilePath: zipFilePath,
      archiveFileSha256,
      extractedFilePath,
      extractedFileName: safeFileName,
      extractedFileSha256,
      extractedFileSizeBytes: extractedStats.size,
      status: "extracted"
    };
  }
}

module.exports = FloridaDatasetArchiveService;
