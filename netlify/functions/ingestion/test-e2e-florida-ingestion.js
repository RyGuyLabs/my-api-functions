// netlify/functions/ingestion/test-e2e-florida-ingestion.js
const fs = require("fs");
const path = require("path");
const os = require("os");
const assert = require("assert");
const { FloridaIngestionService } = require("./FloridaIngestionService.js");
const { FloridaRegistryDatabase } = require("../database/FloridaRegistryDatabase.js");

async function runE2ETest() {
  const tempDbFileName = `test_florida_ingestion_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.db`;
  const tempDbPath = path.join(os.tmpdir(), tempDbFileName);

  let db = null;

  try {
    // Instantiate real database using verified constructor parameter: databasePath
    db = new FloridaRegistryDatabase({ databasePath: tempDbPath });

    const service = new FloridaIngestionService({ database: db });
    const samplePath = path.resolve(process.cwd(), "daily_sample.txt");

    if (!fs.existsSync(samplePath)) {
      throw new Error(`daily_sample.txt not found at: ${samplePath}`);
    }

    // Execute ingestion
    const manifest = await service.processFile(samplePath, {
      batchSize: 250,
      acquisitionType: "daily_delta"
    });

    // Manifest Return Assertions
    assert.strictEqual(manifest.status, "success", "Manifest status must be 'success'");
    assert.strictEqual(
      manifest.linesRead,
      manifest.validRecords + manifest.rejectedRecords,
      "manifest.linesRead must equal validRecords + rejectedRecords"
    );
    assert.strictEqual(
      manifest.recordsIngested,
      manifest.validRecords,
      "manifest.recordsIngested must equal manifest.validRecords"
    );

    // Entity Table Assertions (florida_entities)
    const entityRow = db.db
      .prepare("SELECT * FROM florida_entities WHERE registration_id = ?")
      .get("L26000432480");

    assert.ok(entityRow, "Entity row for L26000432480 must exist in florida_entities");
    assert.strictEqual(entityRow.company_name, "JMB WRLD LLC");
    assert.strictEqual(entityRow.filing_date, "08162026");
    assert.strictEqual(entityRow.principal_address_line1, "1120 SW 76TH COURT");

    // Raw Ledger Table Assertions (florida_raw_records)
    const rawRow = db.db
      .prepare("SELECT * FROM florida_raw_records WHERE registration_id = ?")
      .get("L26000432480");

    assert.ok(rawRow, "Raw record row for L26000432480 must exist in florida_raw_records");
    assert.ok(rawRow.raw_line, "raw_line column must exist");
    assert.strictEqual(rawRow.raw_line.length, 1440, "raw_line length must be exactly 1440 characters");

    // People/Officer Table Assertions (florida_people)
    const personRow = db.db
      .prepare(
        "SELECT * FROM florida_people WHERE registration_id = ? AND person_title = ? AND name = ?"
      )
      .get("L26000432480", "AMBR", "JOANN BORGES");

    assert.ok(personRow, "Person row with title AMBR and name JOANN BORGES must exist in florida_people");
    assert.strictEqual(personRow.address_line1, "1120 SW 76TH COURT");
    assert.strictEqual(personRow.state, "FL");

    // Persisted Manifest Verification (ingestion_manifests)
    const manifestRow = db.db
      .prepare("SELECT * FROM ingestion_manifests WHERE source_file_sha256 = ?")
      .get(manifest.sourceFileSha256);

    assert.ok(manifestRow, "Manifest record must exist in ingestion_manifests table");
    assert.strictEqual(
      Number(manifestRow.records_ingested ?? manifestRow.recordsIngested),
      manifest.recordsIngested,
      "Persisted records_ingested must match returned manifest count"
    );
    assert.strictEqual(
      Number(manifestRow.valid_records ?? manifestRow.validRecords),
      manifest.validRecords,
      "Persisted valid_records must match returned manifest count"
    );
    assert.strictEqual(
      Number(manifestRow.rejected_records ?? manifestRow.rejectedRecords),
      manifest.rejectedRecords,
      "Persisted rejected_records must match returned manifest count"
    );

    // Database Count Reconciliation
    const countResult = db.db
      .prepare("SELECT COUNT(*) AS total FROM florida_entities")
      .get();

    assert.strictEqual(
      countResult.total,
      manifest.recordsIngested,
      "Total rows in florida_entities must match manifest.recordsIngested"
    );

    console.log("PASS: Real end-to-end Florida ingestion test passed successfully.");
  } finally {
    // Teardown: Shutdown database handle and delete temporary SQLite artifacts
    if (db) {
      try {
        if (typeof db.close === "function") {
          db.close();
        } else if (db.db && typeof db.db.close === "function") {
          db.db.close();
        }
      } catch (err) {
        console.error("Warning: Error while closing database connection:", err.message);
      }
    }

    const filesToDelete = [tempDbPath, `${tempDbPath}-wal`, `${tempDbPath}-shm`];
    for (const filePath of filesToDelete) {
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (err) {
          console.error(`Warning: Could not remove temporary file ${filePath}:`, err.message);
        }
      }
    }
  }
}

runE2ETest().catch((err) => {
  console.error("FAIL: End-to-end Florida ingestion test failed:", err);
  process.exit(1);
});
