const assert =
  require("assert");

const {
  GoogleCompanyResearchSearchProvider
} = require(
  "./GoogleCompanyResearchSearchProvider.js"
);

(() => {
  const provider =
    new GoogleCompanyResearchSearchProvider();

  console.log(
    "1. research provider classifies community sources"
  );

  assert.strictEqual(
    provider.classifyDomain(
      "reddit.com"
    ),
    "community"
  );

  console.log(
    "2. research provider classifies directory sources"
  );

  assert.strictEqual(
    provider.classifyDomain(
      "yelp.com"
    ),
    "directory"
  );

  console.log(
    "3. research provider classifies institutional sources"
  );

  assert.strictEqual(
    provider.classifyDomain(
      "example.gov"
    ),
    "institutional"
  );

  console.log(
    "4. ordinary public sources remain usable"
  );

  assert.strictEqual(
    provider.classifyDomain(
      "localbusinessjournal.com"
    ),
    "public_web"
  );

  console.log(
    "5. domains normalize from URLs"
  );

  assert.strictEqual(
    provider.extractDomain(
      "https://www.example.com/news/article"
    ),
    "example.com"
  );

  console.log(
    "Google Company Research Search Provider test PASSED."
  );
})();
