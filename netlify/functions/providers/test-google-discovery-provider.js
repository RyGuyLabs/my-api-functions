const assert = require("assert");

const {
  GoogleDiscoveryProvider
} = require("./GoogleDiscoveryProvider.js");

const provider =
  new GoogleDiscoveryProvider();

console.log("1. direct business domains remain business candidates");

assert.strictEqual(
  provider.classifyDomain("tampabaysolar.com"),
  "business_candidate"
);

console.log("2. directory domains are classified as directories");

assert.strictEqual(
  provider.classifyDomain("www.yelp.com".replace(/^www\./, "")),
  "directory"
);

console.log("3. community/forum domains are not classified as businesses");

assert.strictEqual(
  provider.classifyDomain("reddit.com"),
  "community"
);

assert.strictEqual(
  provider.classifyDomain("diysolarforum.com"),
  "community"
);

console.log("4. editorial/review domains are not classified as businesses");

assert.strictEqual(
  provider.classifyDomain("energysage.com"),
  "editorial"
);

assert.strictEqual(
  provider.classifyDomain("solarreviews.com"),
  "editorial"
);

console.log("5. government and education domains are institutional");

assert.strictEqual(
  provider.classifyDomain("gsaelibrary.gsa.gov"),
  "institutional"
);

assert.strictEqual(
  provider.classifyDomain("business.example.edu"),
  "institutional"
);

console.log("6. subdomains inherit the parent classification");

assert.strictEqual(
  provider.classifyDomain("community.reddit.com"),
  "community"
);

assert.strictEqual(
  provider.classifyDomain("reviews.yelp.com"),
  "directory"
);

console.log("Google Discovery Provider classification test PASSED.");
