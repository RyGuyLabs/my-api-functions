const assert =
  require("assert");

const {
  WebsiteReconProvider
} = require("./websiterecon.js");

const provider =
  new WebsiteReconProvider();

console.log(
  "1. explicit tel links are extracted and normalized"
);

assert.deepStrictEqual(
  provider._extractPhones(`
    <a href="tel:+1-813-555-1212">
      Call us
    </a>
  `),
  [
    "(813) 555-1212"
  ]
);

console.log(
  "2. visible phone numbers are extracted"
);

assert.deepStrictEqual(
  provider._extractPhones(`
    <div>
      Tampa Office: (813) 555-3434
    </div>
  `),
  [
    "(813) 555-3434"
  ]
);

console.log(
  "3. duplicate formatting resolves to one canonical phone"
);

assert.deepStrictEqual(
  provider._extractPhones(`
    <a href="tel:8135551212">Call</a>
    <p>813-555-1212</p>
    <p>(813) 555-1212</p>
  `),
  [
    "(813) 555-1212"
  ]
);

console.log(
  "4. script and structured payload numbers are ignored"
);

assert.deepStrictEqual(
  provider._extractPhones(`
    <script>
      const fake = "813-555-9999";
      const another = "727-555-8888";
    </script>

    <script type="application/ld+json">
      {
        "trackingNumber": "941-555-7777"
      }
    </script>

    <p>
      Contact our office at 813-555-1212.
    </p>
  `),
  [
    "(813) 555-1212"
  ]
);

console.log(
  "5. impossible NANP prefixes are rejected"
);

assert.deepStrictEqual(
  provider._extractPhones(`
    <p>012-555-1212</p>
    <p>813-055-1212</p>
  `),
  []
);

console.log(
  "6. phone observations are bounded"
);

const manyPhones =
  Array.from(
    { length: 30 },
    (_, index) => {
      const suffix =
        String(
          1000 + index
        );

      return `<p>813-555-${suffix}</p>`;
    }
  )
    .join("");

assert.strictEqual(
  provider._extractPhones(
    manyPhones
  ).length,
  20
);

console.log(
  "Website Recon phone extraction test PASSED."
);
