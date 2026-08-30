// netlify/functions/ingestion/test-florida-ingestion-adapter.js
const path = require("path");
const assert = require("assert");
const { FloridaIngestionService } = require("./FloridaIngestionService.js");

async function runTest() {
  const receivedBatches = [];
  let recordedManifest = null;

  // Mock database instance for unit testing
  const mockDatabase = {
    async upsertFullRecordBatch(batch) {
      receivedBatches.push(batch);
      return batch.length;
    },
    async recordIngestionManifest(manifest) {
      recordedManifest = manifest;
      return true;
    }
  };

  const service = new FloridaIngestionService({ database: mockDatabase });
  const samplePath = path.resolve(process.cwd(), "daily_sample.txt");

  const manifest = await service.processFile(samplePath, { batchSize: 100 });

  // Verify multiple batches were created
  assert.ok(
    receivedBatches.length > 1,
    "Should receive multiple batches with batchSize: 100 on daily_sample.txt"
  );

  // Flatten all received batches for whole-dataset assertions
  const allBundles = receivedBatches.flat();

  // Verify batch bounding
  assert.ok(
    receivedBatches.every((batch) => batch.length <= 100),
    "No database batch may exceed configured batchSize"
  );

  // Verify all non-final batches contain exactly 100 records
  const nonFinalBatches = receivedBatches.slice(0, -1);
  assert.ok(
    nonFinalBatches.every((batch) => batch.length === 100),
    "All non-final database batches must contain exactly 100 records"
  );

  // Locate targeted test record: JMB WRLD LLC
  const targetBundle = allBundles.find(
    (b) => b.parsed && b.parsed.registrationId === "L26000432480"
  );
  assert.ok(
    targetBundle,
    "Record L26000432480 (JMB WRLD LLC) must exist in ingested bundles"
  );

  const { parsed, raw, people } = targetBundle;

  // Entity Assertions
  assert.strictEqual(parsed.registrationId, "L26000432480");
  assert.strictEqual(parsed.companyName, "JMB WRLD LLC");
  assert.strictEqual(parsed.formationDate, "08162026");
  assert.strictEqual(parsed.principalAddress.line1, "1120 SW 76TH COURT");
  assert.strictEqual(parsed.mailingAddress.state, "FL");

  // Raw line Assertion
  assert.strictEqual(
    Buffer.byteLength(raw, "utf8"),
    1440,
    "Raw record line must be exactly 1,440 bytes"
  );

  // People/Officer Assertions
  const officer2 = people.find((p) => p.title === "AMBR");
  assert.ok(officer2, "Person with title AMBR must exist");
  assert.strictEqual(officer2.name, "JOANN BORGES");
  assert.strictEqual(officer2.address.line1, "1120 SW 76TH COURT");

  // Manifest Assertions
  assert.ok(recordedManifest, "Manifest should be recorded in database");
  assert.strictEqual(
    manifest.recordsIngested,
    allBundles.length,
    "manifest.recordsIngested must equal total flattened bundles count"
  );
  assert.strictEqual(
    manifest.validRecords,
    allBundles.length,
    "manifest.validRecords must equal total flattened bundles count"
  );
  assert.strictEqual(
    manifest.linesRead,
    manifest.validRecords + manifest.rejectedRecords,
    "manifest.linesRead must equal validRecords + rejectedRecords"
  );

  console.log(
    "✅ test-florida-ingestion-adapter.js PASSED: All Stage 3 ingestion adapter assertions verified."
  );
}

runTest().catch((err) => {
  console.error("❌ test-florida-ingestion-adapter.js FAILED:", err);
  process.exit(1);
});
