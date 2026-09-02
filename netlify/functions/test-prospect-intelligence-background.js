const assert =
  require("assert");

const {
  createHandler
} = require(
  "./prospect-intelligence-background.js"
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
    "1. background worker handles CORS preflight"
  );

  const baseHandler =
    createHandler({
      verifyIdToken:
        async () => ({
          uid:
            "user-123"
        }),

      getControlStore:
        () => ({
          async beginRequest() {
            return {
              disposition:
                "IN_PROGRESS"
            };
          }
        }),

      getJobStore:
        () => ({}),

      getService:
        () => ({})
    });

  const preflight =
    await baseHandler({
      httpMethod:
        "OPTIONS"
    });

  assert.strictEqual(
    preflight.statusCode,
    200
  );

  console.log(
    "2. background worker rejects unsupported methods"
  );

  const wrongMethod =
    await baseHandler({
      httpMethod:
        "GET"
    });

  assert.strictEqual(
    wrongMethod.statusCode,
    405
  );

  console.log(
    "3. Firebase authentication is mandatory"
  );

  const unauthenticated =
    await baseHandler({
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
    unauthenticated.statusCode,
    401
  );

  console.log(
    "4. Idempotency-Key is mandatory"
  );

  const noKey =
    await baseHandler(
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
    "5. cached request does not execute intelligence again"
  );

  let cachedServiceCalled =
    false;

  const cachedHandler =
    createHandler({
      verifyIdToken:
        async () => ({
          uid:
            "user-123"
        }),

      getControlStore:
        () => ({
          async beginRequest() {
            return {
              disposition:
                "CACHED",

              response: {
                status:
                  "success"
              }
            };
          }
        }),

      getJobStore:
        () => ({}),

      getService:
        () => ({
          async buildBrief() {
            cachedServiceCalled =
              true;
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
    cachedServiceCalled,
    false
  );

  console.log(
    "6. in-progress request does not execute twice"
  );

  let runningServiceCalled =
    false;

  const running =
    await baseHandler(
      eventFor()
    );

  assert.strictEqual(
    running.statusCode,
    202
  );

  assert.strictEqual(
    runningServiceCalled,
    false
  );

  console.log(
    "7. fresh request claims, runs, caches, and completes the job"
  );

  const transitions =
    [];

  let controlCompleted =
    false;

  const successHandler =
    createHandler({
      verifyIdToken:
        async () => ({
          uid:
            "user-123"
        }),

      getControlStore:
        () => ({
          async beginRequest({
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
                "CLAIMED"
            };
          },

          async completeRequest({
            response
          }) {
            controlCompleted =
              true;

            assert.strictEqual(
              response.status,
              "success"
            );
          },

          async failRequest() {
            throw new Error(
              "should not fail"
            );
          }
        }),

      getJobStore:
        () => ({
          async createPendingJob({
            uid,
            requestHash,
            idempotencyKey,
            request
          }) {
            assert.strictEqual(
              uid,
              "user-123"
            );

            assert.ok(
              requestHash
            );

            assert.strictEqual(
              idempotencyKey,
              "idem-001"
            );

            assert.strictEqual(
              request.prospectKey,
              "prospect-123"
            );

            transitions.push(
              "PENDING"
            );

            return {
              jobId:
                "job-123",

              created:
                true,

              job: {
                status:
                  "PENDING"
              }
            };
          },

          async markRunning() {
            transitions.push(
              "RUNNING"
            );
          },

          async markCompleted({
            response
          }) {
            transitions.push(
              "COMPLETED"
            );

            assert.strictEqual(
              response.brief
                .briefVersion,
              "1.0"
            );
          },

          async markFailed() {
            throw new Error(
              "should not fail"
            );
          }
        }),

      getService:
        () => ({
          async buildBrief(
            request
          ) {
            assert.strictEqual(
              request.prospectKey,
              "prospect-123"
            );

            return {
              briefVersion:
                "1.0",

              sources: [
                {
                  title:
                    "Source",

                  url:
                    "https://example.com",

                  summary:
                    "Summary"
                }
              ]
            };
          }
        })
    });

  const success =
    await successHandler(
      eventFor()
    );

  assert.strictEqual(
    success.statusCode,
    200
  );

  assert.deepStrictEqual(
    transitions,
    [
      "PENDING",
      "RUNNING",
      "COMPLETED"
    ]
  );

  assert.strictEqual(
    controlCompleted,
    true
  );

  console.log(
    "8. generation failure releases control and marks the job failed"
  );

  let controlFailed =
    false;

  let jobFailed =
    false;

  const failureHandler =
    createHandler({
      verifyIdToken:
        async () => ({
          uid:
            "user-123"
        }),

      getControlStore:
        () => ({
          async beginRequest() {
            return {
              disposition:
                "CLAIMED"
            };
          },

          async completeRequest() {},

          async failRequest() {
            controlFailed =
              true;
          }
        }),

      getJobStore:
        () => ({
          async createPendingJob() {
            return {
              jobId:
                "job-failed",

              created:
                true,

              job: {
                status:
                  "PENDING"
              }
            };
          },

          async markRunning() {},

          async markCompleted() {},

          async markFailed() {
            jobFailed =
              true;
          }
        }),

      getService:
        () => ({
          async buildBrief() {
            throw new Error(
              "generation exploded"
            );
          }
        })
    });

  const failed =
    await failureHandler(
      eventFor()
    );

  assert.strictEqual(
    failed.statusCode,
    500
  );

  assert.strictEqual(
    controlFailed,
    true
  );

  assert.strictEqual(
    jobFailed,
    true
  );

  assert.strictEqual(
    bodyOf(failed).error,
    "Prospect intelligence generation failed."
  );

  console.log(
    "9. worker no longer depends on a private dispatch token"
  );

  const source =
    require("fs")
      .readFileSync(
        require("path")
          .join(
            __dirname,
            "prospect-intelligence-background.js"
          ),
        "utf8"
      );

  assert.ok(
    !source.includes(
      "PROSPECT_INTELLIGENCE_BACKGROUND_TOKEN"
    )
  );

  assert.ok(
    !source.includes(
      "x-prospect-intelligence-dispatch"
    )
  );

  console.log(
    "Prospect Intelligence B2 Background Worker test PASSED."
  );
})().catch(error => {
  console.error(error);
  process.exit(1);
});
