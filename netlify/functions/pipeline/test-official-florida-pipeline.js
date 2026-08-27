// netlify/functions/pipeline/test-official-florida-pipeline.js

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const {
  FloridaRegistryDatabase
} = require("../database/FloridaRegistryDatabase.js");

const {
  OfficialFloridaProvider
} = require("../providers/OfficialFloridaProvider.js");

const {
  runLeadPipeline
} = require("./runLeadPipeline.js");

async function main() {
  const tempDbPath = path.join(
    os.tmpdir(),
    `florida_pipeline_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2)}.db`
  );

  let db = null;

  try {
    db = new FloridaRegistryDatabase({
      databasePath: tempDbPath
    });

    const sampleRecord = {
      registrationId: "L26000999999",
      companyName: "SUNSHINE SOLAR CONTRACTORS LLC",
      entityType: "LLC",
      status: "ACTIVE",
      formationDate: "2026-08-01",
      principalAddress: {
        line1: "123 Solar Way",
        line2: null,
        city: "Miami",
        state: "FL",
        zip: "33101"
      },
      mailingAddress: {
        line1: "123 Solar Way",
        line2: null,
        city: "Miami",
        state: "FL",
        zip: "33101"
      },
      registeredAgent: "RYAN TEST AGENT",
      source: {
        file: "pipeline-test.txt",
        sourceType: "official_state_dataset",
        retrievedAt: new Date().toISOString(),
        recordUpdatedAt: new Date().toISOString()
      }
    };

    await db.upsertBatch([
      sampleRecord
    ]);

    const provider =
      new OfficialFloridaProvider({
        database: db
      });

    const result =
      await runLeadPipeline({
        geoContext: {
          states: ["FL"],
          city: "Miami"
        },
        filters: {
          industry: "solar contractors",
          limit: 10
        },
        provider
      });

    assert.ok(
      result &&
      typeof result === "object",
      "Pipeline must return an object."
    );

    assert.strictEqual(
      result.status,
      "success",
      `Expected pipeline status success, received: ${result.status}`
    );

    assert.ok(
      Array.isArray(result.leads),
      "Pipeline result must include leads array."
    );

    assert.ok(
      result.leads.length > 0,
      "OfficialFloridaProvider pipeline must return at least one lead."
    );

    const lead =
      result.leads.find(
        item =>
          item?.entity?.registrationId ===
          sampleRecord.registrationId
      ) ||
      result.leads[0];

    assert.ok(
      lead,
      "Expected a constructed pipeline lead."
    );

    assert.strictEqual(
      lead.entity.registrationId,
      sampleRecord.registrationId,
      "Registration ID must survive provider → pipeline processing."
    );

    assert.strictEqual(
      lead.entity.companyName,
      sampleRecord.companyName,
      "Company name must survive provider → pipeline processing."
    );

    assert.ok(
      lead.evidenceLedger &&
      lead.evidenceLedger.inputSignalId,
      "Pipeline must create Evidence Ledger binding."
    );

    assert.ok(
      Array.isArray(lead.evidenceSummary),
      "Pipeline lead must contain evidence summary."
    );

    console.log(
      "PASS: OfficialFloridaProvider → runLeadPipeline integration test passed."
    );

  } finally {
    if (db) {
      try {
        db.close();
      } catch (_) {}
    }

    for (const suffix of ["", "-wal", "-shm"]) {
      const file =
        `${tempDbPath}${suffix}`;

      if (fs.existsSync(file)) {
        try {
          fs.unlinkSync(file);
        } catch (_) {}
      }
    }
  }
}

main().catch((error) => {
  console.error(
    "FAIL: OfficialFloridaProvider → runLeadPipeline integration test failed:",
    error
  );

  process.exit(1);
});
