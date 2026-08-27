const fs = require("fs");
const path = require("path");
const os = require("os");
const assert = require("assert");
const { execFileSync } = require("child_process");

const {
  FloridaDatasetAcquisitionService
} = require("../acquisition/FloridaDatasetAcquisitionService.js");

const {
  FloridaDatasetArchiveService
} = require("../acquisition/FloridaDatasetArchiveService.js");

const {
  FloridaIngestionService
} = require("./FloridaIngestionService.js");

const {
  FloridaAcquisitionIngestionOrchestrator
} = require("./FloridaAcquisitionIngestionOrchestrator.js");

function createZipWithPython(
  zipPath,
  sourcePath,
  archiveName
) {
  const script = `
import sys
import zipfile

zip_path = sys.argv[1]
source_path = sys.argv[2]
archive_name = sys.argv[3]

with zipfile.ZipFile(
    zip_path,
    "w",
    zipfile.ZIP_DEFLATED
) as zf:
    zf.write(
        source_path,
        arcname=archive_name
    )
`;

  execFileSync(
    "/usr/bin/python3",
    [
      "-c",
      script,
      zipPath,
      sourcePath,
      archiveName
    ]
  );
}

async function runOrchestratorTest() {
  const tempStorageDir = path.join(
    os.tmpdir(),
    `test_acq_storage_${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 8)}`
  );

  const receivedBatches = [];

  const mockDatabase = {
    async upsertFullRecordBatch(batch) {
      receivedBatches.push(batch);
      return batch.length;
    },

    async recordIngestionManifest() {
      return true;
    }
  };

  try {
    const acquisitionService =
      new FloridaDatasetAcquisitionService({
        storageDirectory: tempStorageDir
      });

    const archiveService =
      new FloridaDatasetArchiveService();

    const ingestionService =
      new FloridaIngestionService({
        database: mockDatabase
      });

    const orchestrator =
      new FloridaAcquisitionIngestionOrchestrator({
        acquisitionService,
        archiveService,
        ingestionService
      });

    const samplePath =
      path.resolve(
        process.cwd(),
        "daily_sample.txt"
      );

    assert.ok(
      fs.existsSync(samplePath),
      `daily_sample.txt must exist at ${samplePath}`
    );

    const originalAcquire =
      acquisitionService.acquireDataset.bind(
        acquisitionService
      );

    // ============================================================
    // TEST 1: local quarterly_master ZIP acquisition + extraction
    //         + ingestion
    // ============================================================

    console.log(
      "TEST 1: quarterly_master acquisition → extraction → ingestion"
    );

    const quarterlyFixturePath =
      path.join(
        tempStorageDir,
        "quarterly_fixture.zip"
      );

    fs.mkdirSync(
      tempStorageDir,
      {
        recursive: true
      }
    );

    createZipWithPython(
      quarterlyFixturePath,
      samplePath,
      "CORPDATA.TXT"
    );

    assert.ok(
      fs.existsSync(
        quarterlyFixturePath
      ),
      "Quarterly ZIP fixture must exist before pipeline execution"
    );

    const batchesBeforeQuarterly =
      receivedBatches.length;

    let quarterlyAcquireCalled =
      false;

    acquisitionService.acquireDataset =
      async (...args) => {
        quarterlyAcquireCalled =
          true;

        return originalAcquire(
          ...args
        );
      };

    const quarterlyResult =
      await orchestrator.runPipeline({
        acquisitionType:
          "quarterly_master",

        customSourceUrl:
          quarterlyFixturePath,

        outputFileName:
          "quarterly_master_copy.zip",

        batchSize:
          100
      });

    assert.strictEqual(
      quarterlyAcquireCalled,
      true,
      "acquireDataset() must be called for quarterly_master"
    );

    assert.ok(
      quarterlyResult.acquisition,
      "Quarterly result must include acquisition metadata"
    );

    assert.strictEqual(
      quarterlyResult.acquisition.acquisitionType,
      "quarterly_master"
    );

    assert.ok(
      fs.existsSync(
        quarterlyResult.acquisition.localFilePath
      ),
      "Quarterly acquisition must create a local ZIP copy"
    );

    assert.ok(
      quarterlyResult.archive,
      "Quarterly result must include archive extraction metadata"
    );

    assert.strictEqual(
      quarterlyResult.archive.status,
      "extracted"
    );

    assert.ok(
      fs.existsSync(
        quarterlyResult.archive.extractedFilePath
      ),
      "Quarterly archive extraction must produce a physical data file"
    );

    assert.strictEqual(
      path.basename(
        quarterlyResult.archive.extractedFilePath
      ),
      "CORPDATA.TXT"
    );

    assert.strictEqual(
      path.basename(
        path.dirname(
          quarterlyResult.archive.extractedFilePath
        )
      ),
      "extracted_quarterly"
    );

    const extractedQuarterlyBuffer =
      fs.readFileSync(
        quarterlyResult.archive.extractedFilePath
      );

    const originalSampleBuffer =
      fs.readFileSync(
        samplePath
      );

    assert.deepStrictEqual(
      extractedQuarterlyBuffer,
      originalSampleBuffer,
      "Extracted quarterly registry data must exactly match the source fixture"
    );

    assert.ok(
      quarterlyResult.ingestion,
      "Quarterly result must include ingestion metadata"
    );

    assert.strictEqual(
      quarterlyResult.ingestion.status,
      "success"
    );

    assert.ok(
      quarterlyResult.ingestion.recordsIngested > 0,
      "Quarterly master must ingest records"
    );

    assert.strictEqual(
      quarterlyResult.ingestion.recordsIngested,
      quarterlyResult.ingestion.validRecords
    );

    assert.ok(
      receivedBatches.length >
        batchesBeforeQuarterly,
      "Quarterly ingestion must send records to the database"
    );

    console.log(
      "PASS: quarterly_master acquisition → extraction → ingestion"
    );

    // Restore original acquisition method before daily regression.
    acquisitionService.acquireDataset =
      originalAcquire;

    // ============================================================
    // TEST 2: local daily_delta acquisition + ingestion
    // ============================================================

    console.log(
      "TEST 2: daily_delta acquisition → ingestion"
    );

    const batchesBeforeDaily =
      receivedBatches.length;

    let acquireDatasetWasCalled =
      false;

    acquisitionService.acquireDataset =
      async (...args) => {
        acquireDatasetWasCalled =
          true;

        return originalAcquire(
          ...args
        );
      };

    const result =
      await orchestrator.runPipeline({
        acquisitionType:
          "daily_delta",

        customSourceUrl:
          samplePath,

        outputFileName:
          "daily_sample_copy.txt",

        batchSize:
          100
      });

    assert.strictEqual(
      acquireDatasetWasCalled,
      true,
      "acquireDataset() must be called during successful pipeline execution"
    );

    const {
      acquisition,
      archive,
      ingestion
    } = result;

    // Acquisition verification
    assert.ok(
      acquisition,
      "Result must include acquisition metadata"
    );

    assert.strictEqual(
      acquisition.acquisitionType,
      "daily_delta"
    );

    assert.ok(
      fs.existsSync(
        acquisition.localFilePath
      ),
      "Acquisition must create a physical copied file"
    );

    assert.strictEqual(
      path.dirname(
        acquisition.localFilePath
      ),
      path.resolve(
        tempStorageDir
      )
    );

    assert.ok(
      acquisition.fileSizeBytes > 0,
      "Acquired file size must be greater than zero"
    );

    assert.ok(
      typeof acquisition.sourceFileSha256 ===
        "string" &&
        acquisition.sourceFileSha256.length ===
          64,
      "Acquisition must produce a SHA-256 hash"
    );

    // Daily path must bypass archive extraction.
    assert.strictEqual(
      archive,
      null,
      "daily_delta must not invoke archive extraction"
    );

    const copiedBuffer =
      fs.readFileSync(
        acquisition.localFilePath
      );

    const sourceBuffer =
      fs.readFileSync(
        samplePath
      );

    assert.deepStrictEqual(
      copiedBuffer,
      sourceBuffer,
      "Acquired file must exactly match source file"
    );

    // Ingestion verification
    assert.ok(
      ingestion,
      "Result must include ingestion metadata"
    );

    assert.strictEqual(
      ingestion.status,
      "success"
    );

    assert.ok(
      ingestion.recordsIngested > 0,
      "Records must be ingested"
    );

    assert.ok(
      receivedBatches.length >
        batchesBeforeDaily,
      "Database must receive at least one new daily batch"
    );

    assert.strictEqual(
      ingestion.recordsIngested,
      ingestion.validRecords
    );

    console.log(
      "PASS: daily_delta acquisition → ingestion"
    );

    console.log();
    console.log(
      "PASS: Florida acquisition → archive → ingestion orchestrator local integration test passed."
    );
  } finally {
    if (
      fs.existsSync(
        tempStorageDir
      )
    ) {
      fs.rmSync(
        tempStorageDir,
        {
          recursive: true,
          force: true
        }
      );
    }
  }
}

runOrchestratorTest().catch(
  (err) => {
    console.error(
      "FAIL: FloridaAcquisitionIngestionOrchestrator test failed:",
      err
    );

    process.exit(1);
  }
);
