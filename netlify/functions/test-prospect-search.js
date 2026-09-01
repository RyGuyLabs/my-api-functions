const assert =
  require("assert");

const {
  _test
} = require(
  "./prospect-search.js"
);

const {
  getBearerToken,
  validateRequest,
  createHandler
} = _test;

function makeEvent({
  method = "POST",
  token = "test-token",
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
      JSON.stringify(body)
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
    "1. bearer token is extracted"
  );

  assert.strictEqual(
    getBearerToken(
      makeEvent()
    ),
    "test-token"
  );

  console.log(
    "2. request contract normalizes beta defaults"
  );

  assert.deepStrictEqual(
    validateRequest({
      industry:
        " solar contractor ",
      city:
        " Tampa ",
      state:
        "fl"
    }),
    {
      industry:
        "solar contractor",
      city:
        "Tampa",
      state:
        "FL",
      discoveryLimit:
        10,
      autoEnrichLimit:
        5
    }
  );

  console.log(
    "3. OPTIONS succeeds without authentication"
  );

  const handler =
    createHandler({
      verifyIdToken:
        async token => ({
          uid:
            token === "valid-token"
              ? "user-123"
              : null
        }),

      getSearchService:
        () => ({
          async search(request) {
            return {
              status:
                "success",

              query:
                request,

              discoveredCount:
                3,

              prospectCount:
                2,

              excludedCount:
                1,

              autoEnrichLimit:
                request.autoEnrichLimit,

              enrichedCount:
                1,

              prospects: [
                {
                  prospectName:
                    "Tampa Bay Solar",
                  priorityScore:
                    80
                },
                {
                  prospectName:
                    "Second Solar",
                  priorityScore:
                    70
                }
              ],

              excludedSources:
                []
            };
          }
        })
    });

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
    "4. POST requires authentication"
  );

  const unauthenticated =
    await handler(
      makeEvent({
        token:
          null,

        body: {
          industry:
            "solar contractor",
          city:
            "Tampa",
          state:
            "FL"
        }
      })
    );

  assert.strictEqual(
    unauthenticated.statusCode,
    401
  );

  console.log(
    "5. invalid Firebase identity is rejected"
  );

  const invalidToken =
    await handler(
      makeEvent({
        token:
          "invalid-token",

        body: {
          industry:
            "solar contractor",
          city:
            "Tampa",
          state:
            "FL"
        }
      })
    );

  assert.strictEqual(
    invalidToken.statusCode,
    401
  );

  console.log(
    "6. invalid request input returns 400"
  );

  const invalidRequest =
    await handler(
      makeEvent({
        token:
          "valid-token",

        body: {
          industry:
            "",
          city:
            "Tampa",
          state:
            "FL"
        }
      })
    );

  assert.strictEqual(
    invalidRequest.statusCode,
    400
  );

  console.log(
    "7. authenticated request reaches prospect service"
  );

  const success =
    await handler(
      makeEvent({
        token:
          "valid-token",

        body: {
          industry:
            "solar contractor",
          city:
            "Tampa",
          state:
            "fl",
          autoEnrichLimit:
            1
        }
      })
    );

  assert.strictEqual(
    success.statusCode,
    200
  );

  const successBody =
    parseResponse(
      success
    );

  assert.strictEqual(
    successBody.status,
    "success"
  );

  assert.strictEqual(
    successBody.requester.uid,
    "user-123"
  );

  assert.strictEqual(
    successBody.prospectCount,
    2
  );

  assert.strictEqual(
    successBody.autoEnrichLimit,
    1
  );

  console.log(
    "8. unsupported methods return 405"
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
    "Prospect Search endpoint test PASSED."
  );
})().catch(error => {
  console.error(error);
  process.exit(1);
});
