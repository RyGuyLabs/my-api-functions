const assert =
  require("assert");

const {
  _test
} = require(
  "./prospect-qualify.js"
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

const validBody = {
  prospect: {
    prospectName:
      "Tampa Bay Solar",
    candidateName:
      "Tampa Bay Solar",
    candidateDomain:
      "tampabaysolar.com",
    website:
      "https://tampabaysolar.com/",
    registrationId:
      null
  },

  qualification: {
    status:
      "qualified",
    priority:
      "high",
    estimatedValue:
      "25000",
    timing:
      "30 days",
    nextAction:
      "Call owner",
    followUpDate:
      "2026-09-15",
    contactName:
      "Jane Doe",
    contactRole:
      "Owner",
    notes:
      "Strong local fit."
  }
};

(async () => {
  console.log(
    "1. qualification request normalizes controlled sales state"
  );

  const normalized =
    validateRequest(
      validBody
    );

  assert.strictEqual(
    normalized.qualification.status,
    "QUALIFIED"
  );

  assert.strictEqual(
    normalized.qualification.priority,
    "HIGH"
  );

  assert.strictEqual(
    normalized.qualification.estimatedValue,
    25000
  );

  console.log(
    "2. invalid status is rejected"
  );

  assert.throws(
    () =>
      validateRequest({
        ...validBody,

        qualification: {
          ...validBody.qualification,
          status:
            "SOMETHING_RANDOM"
        }
      }),
    /status is invalid/
  );

  console.log(
    "3. invalid priority is rejected"
  );

  assert.throws(
    () =>
      validateRequest({
        ...validBody,

        qualification: {
          ...validBody.qualification,
          priority:
            "SUPER_HIGH"
        }
      }),
    /priority is invalid/
  );

  console.log(
    "4. invalid follow-up date is rejected"
  );

  assert.throws(
    () =>
      validateRequest({
        ...validBody,

        qualification: {
          ...validBody.qualification,
          followUpDate:
            "2026-02-31"
        }
      }),
    /followUpDate is invalid/
  );

  const saves = [];

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

      getStore:
        () => ({
          async saveQualification(
            input
          ) {
            saves.push(
              input
            );

            return {
              prospectKey:
                "prospect_test_key",

              customerUid:
                input.uid,

              prospect:
                input.prospect,

              salesState:
                input.qualification
            };
          }
        })
    });

  console.log(
    "5. OPTIONS succeeds without authentication"
  );

  const options =
    await handler(
      makeEvent({
        method:
          "OPTIONS",
        token:
          null
      })
    );

  assert.strictEqual(
    options.statusCode,
    200
  );

  console.log(
    "6. authentication is required"
  );

  const unauthenticated =
    await handler(
      makeEvent({
        token:
          null,
        body:
          validBody
      })
    );

  assert.strictEqual(
    unauthenticated.statusCode,
    401
  );

  console.log(
    "7. authenticated UID controls customer ownership"
  );

  const success =
    await handler(
      makeEvent({
        body:
          validBody
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
    saves.length,
    1
  );

  assert.strictEqual(
    saves[0].uid,
    "user-123"
  );

  assert.strictEqual(
    saves[0].qualification
      .status,
    "QUALIFIED"
  );

  assert.strictEqual(
    payload.prospectKey,
    "prospect_test_key"
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
    "Prospect Qualify endpoint test PASSED."
  );
})().catch(error => {
  console.error(error);
  process.exit(1);
});
