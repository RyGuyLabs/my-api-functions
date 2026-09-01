const assert =
  require("assert");

const {
  _test
} = require(
  "./prospect-enrich.js"
);

const {
  validateRequest,
  createHandler
} = _test;

function makeEvent({
  method = "POST",
  token = "valid-token",
  body = {}
} = {}) {
  return {
    httpMethod:
      method,

    headers:
      token
        ? {
            Authorization:
              `Bearer ${token}`
          }
        : {},

    body:
      JSON.stringify(
        body
      )
  };
}

function parseResponse(
  response
) {
  return JSON.parse(
    response.body
  );
}

(async () => {
  console.log(
    "1. request contract normalizes prospect input"
  );

  assert.deepStrictEqual(
    validateRequest({
      prospectName:
        " Tampa Bay Solar ",
      website:
        "https://tampabaysolar.com/",
      candidateName:
        " Tampa Bay Solar ",
      candidateDomain:
        "tampabaysolar.com",
      city:
        " Tampa ",
      state:
        "fl"
    }),
    {
      prospectName:
        "Tampa Bay Solar",
      website:
        "https://tampabaysolar.com/",
      candidateName:
        "Tampa Bay Solar",
      candidateDomain:
        "tampabaysolar.com",
      city:
        "Tampa",
      state:
        "FL",
      registryEntity:
        null
    }
  );

  console.log(
    "2. website is required"
  );

  assert.throws(
    () =>
      validateRequest({
        prospectName:
          "Test Prospect"
      }),
    /website is required/
  );

  const enrichmentCalls = [];

  const handler =
    createHandler({
      verifyIdToken:
        async token => ({
          uid:
            token ===
              "valid-token"
              ? "user-123"
              : null
        }),

      getEnrichmentProvider:
        () => ({
          async enrich(
            entity,
            candidateInfo
          ) {
            enrichmentCalls.push({
              entity,
              candidateInfo
            });

            return {
              enrichmentStatus:
                "complete",

              website:
                candidateInfo.website,

              emails: [
                {
                  value:
                    "info@testprospect.com"
                }
              ],

              phones: [
                {
                  value:
                    "(813) 555-1212"
                }
              ]
            };
          }
        })
    });

  console.log(
    "3. OPTIONS succeeds without authentication"
  );

  const optionsResponse =
    await handler(
      makeEvent({
        method:
          "OPTIONS",
        token:
          null
      })
    );

  assert.strictEqual(
    optionsResponse.statusCode,
    200
  );

  console.log(
    "4. authentication is required"
  );

  const unauthenticated =
    await handler(
      makeEvent({
        token:
          null,
        body: {
          prospectName:
            "Test Prospect",
          website:
            "https://testprospect.com"
        }
      })
    );

  assert.strictEqual(
    unauthenticated.statusCode,
    401
  );

  console.log(
    "5. invalid identity is rejected"
  );

  const invalid =
    await handler(
      makeEvent({
        token:
          "bad-token",
        body: {
          prospectName:
            "Test Prospect",
          website:
            "https://testprospect.com"
        }
      })
    );

  assert.strictEqual(
    invalid.statusCode,
    401
  );

  console.log(
    "6. authenticated request enriches exactly one submitted prospect"
  );

  const success =
    await handler(
      makeEvent({
        body: {
          prospectName:
            "Test Prospect",
          candidateName:
            "Test Prospect",
          candidateDomain:
            "testprospect.com",
          website:
            "https://testprospect.com",
          city:
            "Tampa",
          state:
            "FL"
        }
      })
    );

  assert.strictEqual(
    success.statusCode,
    200
  );

  const payload =
    parseResponse(
      success
    );

  assert.strictEqual(
    payload.status,
    "success"
  );

  assert.strictEqual(
    payload.requester.uid,
    "user-123"
  );

  assert.strictEqual(
    payload.enrichment
      .enrichmentStatus,
    "complete"
  );

  assert.strictEqual(
    enrichmentCalls.length,
    1
  );

  assert.strictEqual(
    enrichmentCalls[0]
      .candidateInfo
      .candidateDomain,
    "testprospect.com"
  );

  console.log(
    "7. unsupported methods return 405"
  );

  const methodResponse =
    await handler(
      makeEvent({
        method:
          "GET",
        token:
          null
      })
    );

  assert.strictEqual(
    methodResponse.statusCode,
    405
  );

  console.log(
    "Prospect Enrich endpoint test PASSED."
  );
})().catch(error => {
  console.error(error);
  process.exit(1);
});
