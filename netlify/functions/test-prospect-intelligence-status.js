const assert =
  require("assert");

const {
  createHandler
} = require(
  "./prospect-intelligence-status.js"
)._test;

function eventFor(
  body = {
    jobId:
      "job-123"
  },
  headers = {}
) {
  return {
    httpMethod:
      "POST",

    headers: {
      authorization:
        "Bearer valid-token",

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
    "1. status endpoint handles CORS preflight"
  );

  const baseHandler =
    createHandler({
      verifyIdToken:
        async () => ({
          uid:
            "user-123"
        }),

      getJobStore:
        () => ({
          async getJob() {
            return null;
          }
        })
    });

  const preflight =
    await baseHandler({
      httpMethod:
        "OPTIONS",

      headers:
        {}
    });

  assert.strictEqual(
    preflight.statusCode,
    200
  );

  console.log(
    "2. status endpoint rejects unsupported methods"
  );

  const wrongMethod =
    await baseHandler({
      httpMethod:
        "GET",

      headers:
        {}
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

      headers:
        {},

      body:
        JSON.stringify({
          jobId:
            "job-123"
        })
    });

  assert.strictEqual(
    unauthenticated.statusCode,
    401
  );

  console.log(
    "4. jobId is required"
  );

  const missingJob =
    await baseHandler(
      eventFor({})
    );

  assert.strictEqual(
    missingJob.statusCode,
    400
  );

  console.log(
    "5. unknown or foreign jobs return 404"
  );

  const unknown =
    await baseHandler(
      eventFor()
    );

  assert.strictEqual(
    unknown.statusCode,
    404
  );

  console.log(
    "6. PENDING jobs return HTTP 202"
  );

  const pendingHandler =
    createHandler({
      verifyIdToken:
        async () => ({
          uid:
            "user-123"
        }),

      getJobStore:
        () => ({
          async getJob({
            uid
          }) {
            assert.strictEqual(
              uid,
              "user-123"
            );

            return {
              jobId:
                "job-123",

              status:
                "PENDING"
            };
          }
        })
    });

  const pending =
    await pendingHandler(
      eventFor()
    );

  assert.strictEqual(
    pending.statusCode,
    202
  );

  assert.strictEqual(
    bodyOf(pending).status,
    "pending"
  );

  console.log(
    "7. RUNNING jobs return HTTP 202"
  );

  const runningHandler =
    createHandler({
      verifyIdToken:
        async () => ({
          uid:
            "user-123"
        }),

      getJobStore:
        () => ({
          async getJob() {
            return {
              jobId:
                "job-123",

              status:
                "RUNNING"
            };
          }
        })
    });

  const running =
    await runningHandler(
      eventFor()
    );

  assert.strictEqual(
    running.statusCode,
    202
  );

  assert.strictEqual(
    bodyOf(running).status,
    "running"
  );

  console.log(
    "8. COMPLETED jobs return normalized brief"
  );

  const completedHandler =
    createHandler({
      verifyIdToken:
        async () => ({
          uid:
            "user-123"
        }),

      getJobStore:
        () => ({
          async getJob() {
            return {
              jobId:
                "job-123",

              status:
                "COMPLETED",

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

  const completed =
    await completedHandler(
      eventFor()
    );

  assert.strictEqual(
    completed.statusCode,
    200
  );

  assert.strictEqual(
    bodyOf(completed)
      .brief
      .briefVersion,
    "1.0"
  );

  assert.strictEqual(
    bodyOf(completed)
      .jobId,
    "job-123"
  );

  console.log(
    "9. FAILED jobs return sanitized failure"
  );

  const failedHandler =
    createHandler({
      verifyIdToken:
        async () => ({
          uid:
            "user-123"
        }),

      getJobStore:
        () => ({
          async getJob() {
            return {
              jobId:
                "job-123",

              status:
                "FAILED",

              error:
                "internal provider detail"
            };
          }
        })
    });

  const failed =
    await failedHandler(
      eventFor()
    );

  assert.strictEqual(
    failed.statusCode,
    500
  );

  assert.strictEqual(
    bodyOf(failed).error,
    "Prospect intelligence generation failed."
  );

  assert.ok(
    !JSON.stringify(
      bodyOf(failed)
    ).includes(
      "internal provider detail"
    )
  );

  console.log(
    "Prospect Intelligence Status Endpoint test PASSED."
  );
})().catch(error => {
  console.error(error);
  process.exit(1);
});
