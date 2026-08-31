const assert =
  require("assert");

const {
  ProspectSearchService
} = require(
  "./ProspectSearchService.js"
);

const fakeDiscoveryProvider = {
  name:
    "FakeDiscoveryProvider",

  async discoverCandidates() {
    return [
      {
        discoveryIndex:
          0,
        candidateName:
          "Tampa Bay Solar",
        candidateDomain:
          "tampabaysolar.com",
        formattedUrl:
          "https://tampabaysolar.com",
        snippet:
          "Solar installer serving Tampa, Florida.",
        resultType:
          "business_candidate",
        isLikelyBusiness:
          true,
        discoveryConfidence:
          "medium",
        discoveryEvidence: {
          provider:
            "FakeDiscoveryProvider",
          sourceUrl:
            "https://tampabaysolar.com"
        }
      },
      {
        discoveryIndex:
          1,
        candidateName:
          "West Coast Solar Services",
        candidateDomain:
          "westcoastsolar.example",
        formattedUrl:
          "https://westcoastsolar.example",
        snippet:
          "Florida solar services.",
        resultType:
          "business_candidate",
        isLikelyBusiness:
          true,
        discoveryConfidence:
          "medium",
        discoveryEvidence: {
          provider:
            "FakeDiscoveryProvider",
          sourceUrl:
            "https://westcoastsolar.example"
        }
      },
      {
        discoveryIndex:
          2,
        candidateName:
          "Best Solar Companies in Tampa",
        candidateDomain:
          "reviews.example",
        formattedUrl:
          "https://reviews.example/tampa",
        snippet:
          "Editorial comparison.",
        resultType:
          "editorial",
        isLikelyBusiness:
          false,
        discoveryConfidence:
          "low"
      }
    ];
  }
};

const enrichmentCalls = [];

const fakeEnrichmentProvider = {
  async enrich(entity, candidateInfo) {
    enrichmentCalls.push({
      companyName:
        entity?.companyName ||
        null,

      candidateName:
        candidateInfo?.candidateName ||
        null
    });

    return {
      enrichmentStatus:
        "complete",

      website:
        candidateInfo?.formattedUrl ||
        null,

      emails: [],
      phones: []
    };
  }
};

const fakeRegistryReconciler = {
  async reconcile(candidate) {
    if (
      candidate.candidateName ===
      "Tampa Bay Solar"
    ) {
      return {
        status:
          "registry_matched",
        confidence:
          1,
        registryMatch: {
          registrationId:
            "TEST123",
          companyName:
            "TAMPA BAY SOLAR LLC",
          principalAddress: {
            city:
              "Tampa",
            state:
              "FL"
          }
        },
        alternatives:
          []
      };
    }

    return {
      status:
        "registry_not_found_in_current_dataset",
      confidence:
        0,
      registryMatch:
        null,
      alternatives:
        []
    };
  }
};

(async () => {
  const service =
    new ProspectSearchService({
      discoveryProvider:
        fakeDiscoveryProvider,

      registryReconciler:
        fakeRegistryReconciler,

      enrichmentProvider:
        fakeEnrichmentProvider
    });

  console.log(
    "1. search returns only direct business prospects"
  );

  const result =
    await service.search({
      industry:
        "solar contractor",
      city:
        "Tampa",
      state:
        "FL"
    });

  assert.strictEqual(
    result.status,
    "success"
  );

  assert.strictEqual(
    result.discoveredCount,
    3
  );

  assert.strictEqual(
    result.prospectCount,
    2
  );

  assert.strictEqual(
    result.excludedCount,
    1
  );

  console.log(
    "2. editorial sources are preserved outside the prospect list"
  );

  assert.strictEqual(
    result.excludedSources[0].resultType,
    "editorial"
  );

  console.log(
    "3. registry-backed candidate ranks first"
  );

  assert.strictEqual(
    result.prospects[0].prospectName,
    "TAMPA BAY SOLAR LLC"
  );

  assert.strictEqual(
    result.prospects[0].registry.status,
    "registry_matched"
  );

  assert.strictEqual(
    result.prospects[0].priorityScore,
    100
  );

  console.log(
    "4. unmatched discovery candidate remains usable"
  );

  assert.strictEqual(
    result.prospects[1].registry.status,
    "registry_not_found_in_current_dataset"
  );

  assert.strictEqual(
    result.prospects[1].enrichment.status,
    "not_attempted"
  );

  assert(
    result.prospects[1].priorityScore >
      0
  );

  console.log(
    "5. ranking completes before selective enrichment"
  );

  enrichmentCalls.length = 0;

  const enrichedResult =
    await service.search({
      industry:
        "solar contractor",
      city:
        "Tampa",
      state:
        "FL",
      autoEnrichLimit:
        1
    });

  assert.strictEqual(
    enrichedResult.enrichedCount,
    1
  );

  assert.strictEqual(
    enrichmentCalls.length,
    1
  );

  assert.strictEqual(
    enrichmentCalls[0].candidateName,
    enrichedResult.prospects[0].candidateName
  );

  assert.strictEqual(
    enrichedResult.prospects[0].enrichment.status,
    "complete"
  );

  assert.strictEqual(
    enrichedResult.prospects[1].enrichment.status,
    "not_attempted"
  );

  console.log(
    "6. auto enrichment is capped at ten prospects"
  );

  enrichmentCalls.length = 0;

  const cappedResult =
    await service.search({
      industry:
        "solar contractor",
      city:
        "Tampa",
      state:
        "FL",
      autoEnrichLimit:
        999
    });

  assert.strictEqual(
    cappedResult.autoEnrichLimit,
    10
  );

  assert.strictEqual(
    cappedResult.enrichedCount,
    2
  );

  assert.strictEqual(
    enrichmentCalls.length,
    2
  );

  console.log(
    "7. missing industry is rejected"
  );

  await assert.rejects(
    () =>
      service.search({
        industry:
          "",
        city:
          "Tampa",
        state:
          "FL"
      }),
    /requires an industry/
  );

  console.log(
    "Prospect Search Service test PASSED."
  );
})().catch(error => {
  console.error(error);
  process.exit(1);
});
