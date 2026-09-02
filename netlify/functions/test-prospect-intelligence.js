const assert =
  require("assert");

const {
  MAX_BODY_BYTES,
  buildRequestHash,
  createHandler
} = require(
  "./prospect-intelligence.js"
)._test;

function validBody() {
  return {
    prospectKey:
      "prospect-123",

    prospect: {
      prospectName:
        "Tampa Bay Solar",

      candidateDomain:
        "tampabaysolar.com",

      location: {
        city:
          "Tampa",

        state:
          "FL"
      }
    },

    salesContext: {
      contextId:
        "insurance-v1",

      offering:
        "Commercial insurance review"
    }
  };
}

function eventFor(
  body = validBody(),
  headers = {}
) {
  return {
    httpMethod:
      "POST",

    headers: {
      authorization:
        "Bearer valid-token",

      "idempotency-key":
        "idem-001",

      ...headers
    },

    body:
      JSON.stringify(
        body
      )
  };
}

function bodyOf(
  response
) {
  return response.body
    ? JSON.parse(
        response.body
      )
    : null;
}

(async () => {
  console.log(
    "1. cache endpoint handles CORS preflight"
  );

  const missHandler =
    createHandler({
      verifyIdToken:
        async () => ({
          uid:
            "user-123"
        }),

      getControlStore:
        () => ({
          async lookupCachedResponse() {
            return {
              disposition:
                "MISS"
            };
          }
        })
    });

  const preflight =
    await missHandler({
      httpMethod:
        "OPTIONS"
    });

  assert.strictEqual(
    preflight.statusCode,
    200
  );

  console.log(
    "2. unsupported methods are rejected"
  );

  const wrongMethod =
    await missHandler({
      httpMethod:
        "GET"
    });

  assert.strictEqual(
    wrongMethod.statusCode,
    405
  );

  console.log(
    "3. oversized bodies are rejected"
  );

  const oversized =
    await missHandler({
      httpMethod:
        "POST",

      headers: {
        authorization:
          "Bearer valid-token",

        "idempotency-key":
          "idem-large"
      },

      body:
        JSON.stringify({
          payload:
            "x".repeat(
              MAX_BODY_BYTES +
              100
            )
        })
    });

  assert.strictEqual(
    oversized.statusCode,
    413
  );

  console.log(
    "4. Firebase authentication is mandatory"
  );

  const noAuth =
    await missHandler({
      httpMethod:
        "POST",

      headers: {
        "idempotency-key":
          "idem-001"
      },

      body:
        JSON.stringify(
          validBody()
        )
    });

  assert.strictEqual(
    noAuth.statusCode,
    401
  );

  console.log(
    "5. Idempotency-Key is mandatory"
  );

  const noKey =
    await missHandler(
      eventFor(
        validBody(),
        {
          "idempotency-key":
            undefined
        }
      )
    );

  assert.strictEqual(
    noKey.statusCode,
    400
  );

  console.log(
    "6. request hashing remains deterministic"
  );

  const hashA =
    buildRequestHash({
      b:
        2,
      a:
        1
    });

  const hashB =
    buildRequestHash({
      a:
        1,
      b:
        2
    });

  assert.strictEqual(
    hashA,
    hashB
  );

  console.log(
    "7. cache hit returns normalized brief synchronously"
  );

  const cachedHandler =
    createHandler({
      verifyIdToken:
        async () => ({
          uid:
            "user-123"
        }),

      getControlStore:
        () => ({
          async lookupCachedResponse({
            uid,
            idempotencyKey,
            requestHash
          }) {
            assert.strictEqual(
              uid,
              "user-123"
            );

            assert.strictEqual(
              idempotencyKey,
              "idem-001"
            );

            assert.ok(
              requestHash
            );

            return {
              disposition:
                "CACHED",

              response: {
                status:
                  "success",

                cached:
                  false,

                brief: {
                  briefVersion:
                    "1.0"
                },

                sources:
                  []
              }
            };
          }
        })
    });

  const cached =
    await cachedHandler(
      eventFor()
    );

  assert.strictEqual(
    cached.statusCode,
    200
  );

  assert.strictEqual(
    bodyOf(cached).cached,
    true
  );

  assert.strictEqual(
    bodyOf(cached)
      .brief
      .briefVersion,
    "1.0"
  );

  console.log(
    "8. cache miss returns deterministic job identity without claiming"
  );

  let lookupCount =
    0;

  const firstMiss =
    await missHandler(
      eventFor()
    );

  const secondMiss =
    await missHandler(
      eventFor()
    );

  assert.strictEqual(
    firstMiss.statusCode,
    404
  );

  assert.strictEqual(
    secondMiss.statusCode,
    404
  );

  assert.strictEqual(
    bodyOf(firstMiss).status,
    "miss"
  );

  assert.strictEqual(
    bodyOf(firstMiss).cached,
    false
  );

  assert.ok(
    bodyOf(firstMiss).jobId
  );

  assert.strictEqual(
    bodyOf(firstMiss).jobId,
    bodyOf(secondMiss).jobId
  );

  console.log(
    "9. cache lookup idempotency conflict returns 409"
  );

  const conflictHandler =
    createHandler({
      verifyIdToken:
        async () => ({
          uid:
            "user-123"
        }),

      getControlStore:
        () => ({
          async lookupCachedResponse() {
            const error =
              new Error(
                "Idempotency-Key was already used for a different request."
              );

            error.statusCode =
              409;

            throw error;
          }
        })
    });

  const conflict =
    await conflictHandler(
      eventFor()
    );

  assert.strictEqual(
    conflict.statusCode,
    409
  );

  console.log(
    "10. synchronous cache endpoint never executes or dispatches intelligence"
  );

  const source =
    require("fs")
      .readFileSync(
        require("path")
          .join(
            __dirname,
            "prospect-intelligence.js"
          ),
        "utf8"
      );

  assert.ok(
    !source.includes(
      "ProspectIntelligenceService"
    )
  );

  assert.ok(
    !source.includes(
      "GeminiProspectReasoningProvider"
    )
  );

  assert.ok(
    !source.includes(
      "GoogleCompanyResearchSearchProvider"
    )
  );

  assert.ok(
    !source.includes(
      "dispatchBackground"
    )
  );

  assert.ok(
    !source.includes(
      ".beginRequest("
    )
  );

  assert.ok(
    !source.includes(
      ".createPendingJob("
    )
  );

  console.log(
    "Prospect Intelligence Cache Fast-Path test PASSED."
  );
})().catch(error => {
  console.error(error);
  process.exit(1);
});
