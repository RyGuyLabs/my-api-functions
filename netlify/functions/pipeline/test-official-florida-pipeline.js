// netlify/functions/pipeline/test-official-florida-pipeline.js

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const {
  FloridaRegistryDatabase
} = require("../database/FloridaRegistryDatabase.js");

const {
  FloridaIngestionService
} = require("../ingestion/FloridaIngestionService.js");

const {
  OfficialFloridaProvider
} = require("../providers/OfficialFloridaProvider.js");

const {
  runLeadPipeline
} = require("./runLeadPipeline.js");

async function runTest() {
  const tempDbPath =
    path.join(
      os.tmpdir(),
      `florida_pipeline_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2)}.db`
    );

  let db = null;

  try {
    // ============================================================
    // 1. CREATE REAL SQLITE DATABASE
    // ============================================================

    db =
      new FloridaRegistryDatabase({
        databasePath:
          tempDbPath
      });

    // ============================================================
    // 2. INGEST KNOWN SAMPLE DATA
    // ============================================================

    const samplePath =
      path.resolve(
        process.cwd(),
        "daily_sample.txt"
      );

    assert.ok(
      fs.existsSync(samplePath),
      `Expected daily_sample.txt at ${samplePath}`
    );

    const ingestionService =
      new FloridaIngestionService({
        database:
          db
      });

    const ingestionManifest =
      await ingestionService.processFile(
        samplePath,
        {
          acquisitionType:
            "daily_delta",

          batchSize:
            100
        }
      );

    assert.strictEqual(
      ingestionManifest.status,
      "success",
      "Sample Florida ingestion must succeed"
    );

    assert.ok(
      ingestionManifest.recordsIngested > 0,
      "Sample ingestion must insert at least one record"
    );

    // ============================================================
    // 3. FIND A REAL INGESTED RECORD TO DRIVE THE SEARCH
    // ============================================================

    const dbRow =
      db.db
        .prepare(`
          SELECT
            registration_id,
            company_name,
            principal_city,
            principal_state
          FROM florida_entities
          WHERE registration_id IS NOT NULL
            AND company_name IS NOT NULL
          ORDER BY company_name ASC
          LIMIT 1
        `)
        .get();

    assert.ok(
      dbRow,
      "Expected at least one Florida record in SQLite"
    );

    assert.ok(
      dbRow.company_name,
      "Selected SQLite row must contain company_name"
    );

    // ============================================================
    // 4. BUILD OFFICIAL PROVIDER
    // ============================================================

    const provider =
      new OfficialFloridaProvider({
        database:
          db
      });

    assert.strictEqual(
      provider.name,
      "OfficialFloridaProvider"
    );

    // ============================================================
    // 5. BUILD A SEARCH TERM THAT FLORIDA DATABASE CAN MATCH
    //
    // FloridaRegistryDatabase currently performs registry-name
    // discovery against company_name, so use a meaningful token
    // from the actual ingested company name.
    // ============================================================

    const companyTokens =
      String(dbRow.company_name)
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter(
          token =>
            token.length >= 3 &&
            ![
              "llc",
              "inc",
              "corp",
              "corporation",
              "company",
              "co"
            ].includes(token)
        );

    const queryToken =
      companyTokens[0];

    assert.ok(
      queryToken,
      `Unable to derive searchable token from company name: ${dbRow.company_name}`
    );

    const city =
      dbRow.principal_city ||
      "Florida";

    const geoContext =
      dbRow.principal_city
        ? {
            city:
              dbRow.principal_city,

            states: [
              "FL"
            ]
          }
        : {
            states: [
              "FL"
            ]
          };

    // ============================================================
    // 6. EXECUTE EXISTING PIPELINE WITH PROVIDER INJECTION
    // ============================================================

    const result =
      await runLeadPipeline({
        geoContext,

        filters: {
          industry:
            queryToken,

          limit:
            20
        },

        provider
      });

    // ============================================================
    // 7. ASSERT PIPELINE CONTRACT
    // ============================================================

    assert.ok(
      result &&
      typeof result === "object",
      "Pipeline must return an object"
    );

    assert.notStrictEqual(
      result.status,
      "invalid_intent",
      `Pipeline rejected valid test query "${queryToken}"`
    );

    assert.notStrictEqual(
      result.status,
      "unavailable",
      "Official Florida provider must not be treated as unavailable"
    );

    assert.ok(
      Array.isArray(result.leads),
      "Pipeline result must expose leads[]"
    );

    assert.ok(
      result.leads.length > 0,
      `Official Florida pipeline returned no leads for token "${queryToken}" in ${city}`
    );

    // ============================================================
    // 8. VERIFY KNOWN SQLITE RECORD REACHES PIPELINE OUTPUT
    // ============================================================

    const matchingLead =
      result.leads.find(
        lead =>
          lead?.entity?.registrationId ===
            dbRow.registration_id ||
          lead?.prospectName ===
            dbRow.company_name
      );

    assert.ok(
      matchingLead,
      `Expected SQLite entity ${dbRow.registration_id} / ${dbRow.company_name} in pipeline output`
    );

    assert.strictEqual(
      matchingLead.entity.registrationId,
      dbRow.registration_id,
      "Pipeline registrationId must match SQLite source record"
    );

    assert.strictEqual(
      matchingLead.entity.companyName,
      dbRow.company_name,
      "Pipeline companyName must match SQLite source record"
    );

    // ============================================================
    // 9. VERIFY EVIDENCE LEDGER SURVIVED PROVIDER SWITCH
    // ============================================================

    assert.ok(
      matchingLead.evidenceLedger,
      "Pipeline lead must contain evidenceLedger binding"
    );

    assert.ok(
      matchingLead.evidenceLedger.inputSignalId,
      "Evidence ledger must produce inputSignalId"
    );

    assert.ok(
      matchingLead.evidenceLedger.sourceContentHash,
      "Evidence ledger must produce sourceContentHash"
    );

    // ============================================================
    // 10. VERIFY QUALIFICATION CONTRACT SURVIVED
    // ============================================================

    assert.ok(
      Object.prototype.hasOwnProperty.call(
        matchingLead,
        "score"
      ),
      "Lead must preserve qualification score field"
    );

    assert.ok(
      Array.isArray(
        matchingLead.qualificationReasons
      ),
      "Lead must preserve qualificationReasons[]"
    );

    assert.ok(
      Array.isArray(
        matchingLead.salesSignals
      ),
      "Lead must preserve salesSignals[]"
    );

    // ============================================================
    // 11. VERIFY ROOT LEGACY CONTRACT SURVIVED
    // ============================================================

    assert.strictEqual(
      result.status,
      "success",
      "Successful official-provider pipeline should return status=success"
    );

    assert.strictEqual(
      result.count,
      result.leads.length,
      "Root count must equal leads.length"
    );

    assert.ok(
      result.prospectName,
      "Legacy root prospectName binding must remain available"
    );

    console.log(
      "PASS: OfficialFloridaProvider → runLeadPipeline real SQLite integration test passed."
    );

  } finally {
    if (
      db &&
      db.db &&
      typeof db.db.close ===
        "function"
    ) {
      try {
        db.db.close();
      } catch (_) {}
    }

    for (
      const suffix of [
        "",
        "-wal",
        "-shm"
      ]
    ) {
      const file =
        `${tempDbPath}${suffix}`;

      if (
        fs.existsSync(file)
      ) {
        try {
          fs.unlinkSync(file);
        } catch (_) {}
      }
    }
  }
}

runTest()
  .catch(
    error => {
      console.error(
        "FAIL: Official Florida pipeline integration test failed:",
        error
      );

      process.exit(1);
    }
  );
