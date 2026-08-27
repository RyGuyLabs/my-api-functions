// netlify/functions/pipeline/test-official-florida-pipeline.js

const fs = require("fs");
const path = require("path");
const os = require("os");
const assert = require("assert");

const { FloridaRegistryDatabase } = require("../database/FloridaRegistryDatabase");
const { FloridaIngestionService } = require("../ingestion/FloridaIngestionService");
const { OfficialFloridaProvider } = require("../providers/OfficialFloridaProvider");
const { runLeadPipeline } = require("./runLeadPipeline");

async function runPipelineTest() {
  const tempDbFileName = `test_pipeline_florida_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.db`;
  const tempDbPath = path.join(os.tmpdir(), tempDbFileName);

  let db = null;

  try {
    // 1 & 2. Instantiate FloridaRegistryDatabase with a temporary SQLite database
    db = new FloridaRegistryDatabase({
      databasePath: tempDbPath
    });

    // 3. Instantiate FloridaIngestionService
    const ingestionService = new FloridaIngestionService({
      database: db
    });

    // 4. Resolve daily_sample.txt and ingest
    const samplePath = path.resolve(process.cwd(), "daily_sample.txt");
    assert.strictEqual(
      fs.existsSync(samplePath),
      true,
      `Sample file daily_sample.txt must exist at ${samplePath}`
    );

    const ingestResult = await ingestionService.processFile(samplePath, {
      acquisitionType: "daily_delta",
      batchSize: 250
    });

    assert.strictEqual(ingestResult.status, "success");
    assert.ok(ingestResult.recordsIngested > 0);

    // 5. Instantiate OfficialFloridaProvider with local database reference
    const provider = new OfficialFloridaProvider({
      database: db
    });

    // Verify known record L26000432480 / JMB WRLD LLC exists in sqlite
    const knownDbRow = db.db
      .prepare("SELECT registration_id, company_name FROM florida_entities WHERE registration_id = ?")
      .get("L26000432480");

    assert.ok(knownDbRow, "Known record L26000432480 must exist in database");
    assert.strictEqual(knownDbRow.company_name, "JMB WRLD LLC");

    // 6. Execute runLeadPipeline with injected OfficialFloridaProvider using known query
    const pipelineOutput = await runLeadPipeline({
      query: "JMB WRLD LLC",
      limit: 10,
      enableEnrichment: false, // Isolate pipeline execution without network calls
      provider
    });

    // Assertions
    assert.ok(pipelineOutput, "Pipeline returned output");
    assert.ok(pipelineOutput.leads.length > 0, "Pipeline produced leads from local SQLite dataset");

    const matchLeadObj = pipelineOutput.leads.find(
      (item) => item.lead.registrationId === "L26000432480"
    );
    assert.ok(matchLeadObj, "Target lead L26000432480 must be present in output");

    const { lead, ledgerEntries } = matchLeadObj;

    // Verify Provider identity
    assert.strictEqual(lead.source.provider, "OfficialFloridaProvider");
    assert.strictEqual(lead.source.sourceType, "official_state_dataset");

    // Verify Lead normalization data
    assert.strictEqual(lead.companyName, "JMB WRLD LLC");
    assert.strictEqual(lead.registrationId, "L26000432480");

    // Verify Source reference format (deterministic florida-dos-* ref)
    assert.ok(
      lead.source.sourceUrl.startsWith("florida-dos-dataset://") ||
      lead.source.sourceUrl.startsWith("florida-dos-registry://"),
      `sourceUrl should start with florida-dos- dataset or registry reference. Got: ${lead.source.sourceUrl}`
    );
    assert.strictEqual(
      lead.source.sourceUrl.includes("search.sunbiz.org"),
      false,
      "OfficialFloridaProvider should not default to generic search.sunbiz.org"
    );

    // Verify Evidence Ledger entries
    assert.ok(Array.isArray(ledgerEntries), "Ledger entries should be an array");
    const ingestionEntry = ledgerEntries.find((e) => e.eventType === "INGESTION");
    assert.ok(ingestionEntry, "Ingestion event must be recorded in Evidence Ledger");
    assert.strictEqual(ingestionEntry.provider, "OfficialFloridaProvider");
    assert.strictEqual(ingestionEntry.normalizedRecord.registrationId, "L26000432480");

    console.log("PASS: OfficialFloridaProvider injected runLeadPipeline integration test passed.");
  } finally {
    if (db) {
      try {
        db.close();
      } catch (_) {}
    }

    const filesToRemove = [tempDbPath, `${tempDbPath}-wal`, `${tempDbPath}-shm`];
    for (const filePath of filesToRemove) {
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (_) {}
      }
    }
  }
}

runPipelineTest().catch((err) => {
  console.error("FAIL: Pipeline test failed with error:", err);
  process.exit(1);
});
