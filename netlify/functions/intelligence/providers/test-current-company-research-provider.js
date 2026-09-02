const assert =
  require("assert");

const {
  CurrentCompanyResearchProvider
} = require(
  "./CurrentCompanyResearchProvider.js"
);

(async () => {
  console.log(
    "1. research provider requires discovery dependency"
  );

  assert.throws(
    () =>
      new CurrentCompanyResearchProvider(),
    /requires a Google discovery provider/
  );

  console.log(
    "2. provider builds company-specific research queries"
  );

  const calls = [];

  const fakeDiscovery = {
    async discoverCandidates(
      query,
      geo,
      options
    ) {
      calls.push({
        query,
        geo,
        options
      });

      const companyOwned =
        query.includes(
          "site:tampabaysolar.com"
        );

      return [
        {
          title:
            companyOwned
              ? "Tampa Bay Solar Company Page"
              : "Example Company Update",

          snippet:
            companyOwned
              ? "Official company information."
              : "The company announced a recent expansion.",

          formattedUrl:
            companyOwned
              ? "https://tampabaysolar.com/company-update"
              : "https://example.com/update",

          candidateDomain:
            companyOwned
              ? "tampabaysolar.com"
              : "example.com"
        }
      ];
    }
  };

  const provider =
    new CurrentCompanyResearchProvider({
      googleDiscoveryProvider:
        fakeDiscovery,

      clock:
        () =>
          new Date(
            "2026-09-01T15:00:00.000Z"
          )
    });

  const result =
    await provider.research({
      prospectName:
        "Tampa Bay Solar",

      candidateDomain:
        "tampabaysolar.com",

      city:
        "Tampa",

      state:
        "FL",

      perQueryLimit:
        3
    });

  assert.strictEqual(
    result.queries.length,
    3
  );

  assert.ok(
    result.queries.some(
      querySpec =>
        querySpec.intent ===
          "CURRENT_DEVELOPMENTS"
    )
  );

  assert.ok(
    result.queries.some(
      querySpec =>
        querySpec.intent ===
          "COMPANY_OWNED" &&
        querySpec.query.includes(
          "site:tampabaysolar.com"
        )
    )
  );

  assert.strictEqual(
    result.searchedAt,
    "2026-09-01T15:00:00.000Z"
  );

  console.log(
    "3. duplicate source URLs are removed"
  );

  assert.strictEqual(
    result.results.length,
    2
  );

  assert.strictEqual(
    result.results[0].url,
    "https://example.com/update"
  );

  assert.strictEqual(
    result.results[0].sourceQuality,
    "STANDARD"
  );

  console.log(
    "4. company-owned research is explicitly first-party"
  );

  const companyOwnedCall =
    calls.find(
      call =>
        call.query.includes(
          "site:tampabaysolar.com"
        )
    );

  assert.ok(
    companyOwnedCall
  );

  const companyOwnedResult =
    result.results.find(
      item =>
        item.intent ===
        "COMPANY_OWNED"
    );

  assert.ok(
    companyOwnedResult
  );

  assert.strictEqual(
    companyOwnedResult
      .sourceType,
    "company_owned"
  );

  assert.strictEqual(
    companyOwnedResult
      .sourceQuality,
    "FIRST_PARTY"
  );

  console.log(
    "5. provider caps each discovery query to three results"
  );

  assert.ok(
    calls.every(
      call =>
        call.options.limit <=
        3
    )
  );

  console.log(
    "6. individual query failures do not destroy the entire research result"
  );

  let queryCount =
    0;

  const partialDiscovery = {
    async discoverCandidates() {
      queryCount += 1;

      if (
        queryCount === 1
      ) {
        throw new Error(
          "Temporary search failure"
        );
      }

      return [
        {
          title:
            "Second Source",

          snippet:
            "Public company information.",

          formattedUrl:
            "https://example.org/company"
        }
      ];
    }
  };

  const partialProvider =
    new CurrentCompanyResearchProvider({
      googleDiscoveryProvider:
        partialDiscovery,

      clock:
        () =>
          new Date(
            "2026-09-01T15:30:00.000Z"
          )
    });

  const partial =
    await partialProvider.research({
      prospectName:
        "Example Prospect"
    });

  assert.ok(
    partial.results.length >
      0
  );

  assert.strictEqual(
    partial.errors.length,
    1
  );

  console.log(
    "7. independent research queries execute concurrently"
  );

  let activeCalls =
    0;

  let peakConcurrentCalls =
    0;

  const concurrentDiscovery = {
    async discoverCandidates(
      query
    ) {
      activeCalls += 1;

      peakConcurrentCalls =
        Math.max(
          peakConcurrentCalls,
          activeCalls
        );

      await new Promise(
        resolve =>
          setTimeout(
            resolve,
            25
          )
      );

      activeCalls -= 1;

      return [
        {
          title:
            `Result for ${query}`,

          snippet:
            "Concurrent research result.",

          formattedUrl:
            `https://example.com/${encodeURIComponent(query)}`,

          candidateDomain:
            "example.com",

          sourceType:
            "public_web"
        }
      ];
    }
  };

  const concurrentProvider =
    new CurrentCompanyResearchProvider({
      googleDiscoveryProvider:
        concurrentDiscovery,

      clock:
        () =>
          new Date(
            "2026-09-01T16:00:00.000Z"
          )
    });

  const concurrentResult =
    await concurrentProvider.research({
      prospectName:
        "Concurrent Prospect",

      candidateDomain:
        "concurrent.example.com",

      city:
        "Tampa",

      state:
        "FL"
    });

  assert.strictEqual(
    concurrentResult.queries.length,
    3
  );

  assert.ok(
    peakConcurrentCalls >=
      2
  );

  console.log(
    "Current Company Research Provider test PASSED."
  );
})().catch(error => {
  console.error(error);
  process.exit(1);
});
