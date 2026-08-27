// netlify/functions/providers/test-official-florida-provider.js

const fs = require("fs");
const path = require("path");
const os = require("os");
const assert = require("assert");

const { FloridaRegistryDatabase } = require("../database/FloridaRegistryDatabase");
const { FloridaIngestionService } = require("../ingestion/FloridaIngestionService");
const { OfficialFloridaProvider } = require("./OfficialFloridaProvider");
const { IntentParser } = require("../intent/IntentParser");

async function runIntegrationTest() {
  const tempDbFileName = `test_florida_provider_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.db`;
  const tempDbPath = path.join(os.tmpdir(), tempDbFileName);

  let db = null;

  try {
    // 1 & 2. Instantiate FloridaRegistryDatabase with temporary SQLite database
    db = new FloridaRegistryDatabase({
      databasePath: tempDbPath
    });

    // 3. Instantiate FloridaIngestionService
    const ingestionService = new FloridaIngestionService({
      database: db
    });

    // 4 & 5. Resolve and assert daily_sample.txt path
    const samplePath = path.resolve(process.cwd(), "daily_sample.txt");
    assert.strictEqual(
      fs.existsSync(samplePath),
      true,
      `Sample file daily_sample.txt must exist at ${samplePath}`
    );

    // 6. Ingest sample data
    const ingestResult = await ingestionService.processFile(samplePath, {
      acquisitionType: "daily_delta",
      batchSize: 250
    });

    // 7. Assert ingestion status and record count
    assert.strictEqual(ingestResult.status, "success", "Ingestion status should be success");
    assert.ok(
      ingestResult.recordsIngested > 0,
      `Ingested records should be > 0, got ${ingestResult.recordsIngested}`
    );

    // 8. Instantiate OfficialFloridaProvider
    const provider = new OfficialFloridaProvider({
      database: db
    });

    // 9. Assert getCapabilityProfile() metadata
    const profile = provider.getCapabilityProfile();
    assert.strictEqual(profile.provider, "OfficialFloridaProvider");
    assert.deepStrictEqual(profile.geography, ["FL"]);
    assert.strictEqual(profile.sourceType, "official_state_dataset");
    assert.strictEqual(profile.acquisitionMode, "local_database");
    assert.strictEqual(profile.requiresInteractiveWebAccess, false);

    // 10. Extract a known row directly from SQLite for deterministic testing
    const dbRow = db.db.prepare("SELECT company_name, doc_number FROM florida_entities LIMIT 1").get();
    assert.ok(dbRow, "SQLite database should contain at least one ingested row");

    const sampleCompanyName = dbRow.company_name;

    // Build deterministic SearchIntent structure
    const searchIntent = {
      industry: {
        canonical: sampleCompanyName,
        keywords: [sampleCompanyName],
        classifications: []
      },
      geography: {
        state: "FL",
        city: null,
        county: null,
        zip: null
      },
      limit: 10,
      searchMode: "entity_name"
    };

    // 11. Execute search and assert contract return structure
    const searchResult = await provider.search(searchIntent);
    assert.strictEqual(searchResult.providerStatus, "success");
    assert.strictEqual(searchResult.provider, "OfficialFloridaProvider");
    assert.strictEqual(searchResult.sourceType, "official_state_dataset");
    assert.strictEqual(
      searchResult.authority,
      "Florida Department of State Division of Corporations"
    );
    assert.ok(Array.isArray(searchResult.records), "searchResult.records should be an Array");
    assert.ok(searchResult.records.length > 0, "searchResult.records should not be empty");
    assert.strictEqual(searchResult.dataset.jurisdiction, "FL");

    // 12. Locate known database record by registrationId and check properties
    const foundRecord = searchResult.records.find(
      (r) => r.registrationId === dbRow.doc_number
    ) || searchResult.records[0];

    assert.ok(foundRecord.registrationId, "registrationId should exist");
    assert.ok(foundRecord.companyName, "companyName should exist");
    assert.strictEqual(typeof foundRecord.principalAddress, "object");
    assert.strictEqual(typeof foundRecord.source, "object");
    assert.strictEqual(foundRecord.source.sourceType, "official_state_dataset");

    // 13. Test normalize() method
    const normalized = provider.normalize(foundRecord);
    assert.notStrictEqual(normalized, foundRecord, "normalized must return a new object reference");
    assert.strictEqual(normalized.companyName, foundRecord.companyName);
    assert.strictEqual(normalized.registrationId, foundRecord.registrationId);
    assert.deepStrictEqual(normalized.principalAddress, foundRecord.principalAddress);

    // 14. Test getSourceReference() method
    const sourceRef = provider.getSourceReference(foundRecord, normalized);
    assert.strictEqual(typeof sourceRef, "string");
    assert.ok(
      sourceRef.startsWith("https://search.sunbiz.org/"),
      "Source ref must start with https://search.sunbiz.org/"
    );
    assert.ok(
      sourceRef.includes(encodeURIComponent(normalized.registrationId)),
      "Source ref must include encoded registrationId"
    );
    assert.strictEqual(sourceRef.includes("["), false, "Must not contain markdown syntax '['");
    assert.strictEqual(sourceRef.includes("]"), false, "Must not contain markdown syntax ']'");

    // 15. Unsupported geography test
    const gaIntent = {
      geography: { state: "GA" }
    };
    const gaResult = await provider.search(gaIntent);
    assert.strictEqual(gaResult.providerStatus, "unsupported");
    assert.deepStrictEqual(gaResult.records, []);
    assert.strictEqual(gaResult.errorType, "UNSUPPORTED_GEOGRAPHY");

    // 16. Database failure boundary test
    const failingProvider = new OfficialFloridaProvider({
      database: {
        async search() {
          throw new Error("forced database failure");
        }
      }
    });

    const failingResult = await failingProvider.search({ geography: { state: "FL" } });
    assert.strictEqual(failingResult.providerStatus, "unavailable");
    assert.deepStrictEqual(failingResult.records, []);
    assert.strictEqual(failingResult.errorType, "DATABASE_QUERY_ERROR");
    assert.ok(
      failingResult.errorMessage.includes("forced database failure"),
      "errorMessage must pass through the caught error message"
    );

    // 17. normalize() parameter validation test
    assert.throws(
      () => provider.normalize(null),
      /Invalid raw record/,
      "Normalizing null should throw"
    );
    assert.throws(
      () => provider.normalize({}),
      /companyName is required/,
      "Normalizing record without companyName should throw"
    );

    // 18. Source reference fallback test
    const fallbackRef = provider.getSourceReference({}, {});
    assert.strictEqual(fallbackRef, "https://search.sunbiz.org/");

    console.log("PASS: OfficialFloridaProvider real SQLite integration test passed.");
  } finally {
    // 19. Cleanup database connections and files safely
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

runIntegrationTest().catch((err) => {
  console.error("FAIL: OfficialFloridaProvider test threw an uncaught error:", err);
  process.exit(1);
});
