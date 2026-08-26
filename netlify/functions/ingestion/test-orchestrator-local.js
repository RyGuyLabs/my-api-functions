const fs = require("fs");
const path = require("path");
const os = require("os");
const assert = require("assert");

const {
  FloridaDatasetAcquisitionService
} = require("../acquisition/FloridaDatasetAcquisitionService.js");

const {
  FloridaIngestionService
} = require("./FloridaIngestionService.js");

const {
  FloridaAcquisitionIngestionOrchestrator
} = require("./FloridaAcquisitionIngestionOrchestrator.js");

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

    const ingestionService =
      new FloridaIngestionService({
        database: mockDatabase
      });

    const orchestrator =
      new FloridaAcquisitionIngestionOrchestrator({
        acquisitionService,
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

    // ============================================================
    // TEST 1: quarterly_master must fail before acquisition begins
    // ============================================================

    let acquireCalledOnQuarterly = false;

    const originalAcquire =
      acquisitionService.acquireDataset.bind(
        acquisitionService
      );

    acquisitionService.acquireDataset =
      async (...args) => {
        acquireCalledOnQuarterly = true;
        return originalAcquire(...args);
      };

    await assert.rejects(
      async () => {
        await orchestrator.runPipeline({
          acquisitionType: "quarterly_master"
        });
      },
      (err) => {
        assert.ok(
          err.message.includes(
            "Quarterly master processing is currently unsupported"
          )
        );

        return true;
      }
    );

    assert.strictEqual(
      acquireCalledOnQuarterly,
      false,
      "acquireDataset() must not run for quarterly_master"
    );

    acquisitionService.acquireDataset =
      originalAcquire;

    // ============================================================
    // TEST 2: local daily_delta acquisition + ingestion
    // ============================================================

    let acquireDatasetWasCalled = false;

    acquisitionService.acquireDataset =
      async (...args) => {
        acquireDatasetWasCalled = true;
        return originalAcquire(...args);
      };

    const result =
      await orchestrator.runPipeline({
        acquisitionType: "daily_delta",
        customSourceUrl: samplePath,
        outputFileName: "daily_sample_copy.txt",
        batchSize: 100
      });

    assert.strictEqual(
      acquireDatasetWasCalled,
      true,
      "acquireDataset() must be called during successful pipeline execution"
    );

    const {
      acquisition,
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
      fs.existsSync(acquisition.localFilePath),
      "Acquisition must create a physical copied file"
    );

    assert.strictEqual(
      path.dirname(acquisition.localFilePath),
      path.resolve(tempStorageDir)
    );

    assert.ok(
      acquisition.fileSizeBytes > 0,
      "Acquired file size must be greater than zero"
    );

    assert.ok(
      typeof acquisition.sourceFileSha256 === "string" &&
      acquisition.sourceFileSha256.length === 64,
      "Acquisition must produce a SHA-256 hash"
    );

    // Verify acquired copy actually matches source hash
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
      receivedBatches.length > 0,
      "Database must receive at least one batch"
    );

    assert.strictEqual(
      ingestion.recordsIngested,
      ingestion.validRecords
    );

    console.log(
      "PASS: Florida acquisition → ingestion orchestrator local integration test passed."
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
