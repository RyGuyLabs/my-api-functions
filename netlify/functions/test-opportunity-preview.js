const assert = require("node:assert/strict");

const opportunityPreview =
  require("./opportunity-preview.js");

const {
  createHandler
} = opportunityPreview._test;

const handler =
  createHandler({
    verifyIdToken:
      async token => {
        if (
          token !==
          "valid-test-token"
        ) {
          throw new Error(
            "Invalid test token."
          );
        }

        return {
          uid:
            "test-user-001"
        };
      }
  });

const baseBody = {
  before: {
    registration_id:
      "L26000432480",

    company_name:
      "TEST FLORIDA COMPANY LLC",

    entity_type:
      "LLC",

    status:
      "INACTIVE",

    principal_address_line1:
      "100 TEST STREET",

    principal_address_line2:
      null,

    principal_city:
      "MIAMI",

    principal_state:
      "FL",

    principal_zip:
      "33144",

    mailing_address_line1:
      "100 TEST STREET",

    mailing_address_line2:
      null,

    mailing_city:
      "MIAMI",

    mailing_state:
      "FL",

    mailing_zip:
      "33144",

    registered_agent_name:
      "TEST AGENT"
  },

  after: {
    registration_id:
      "L26000432480",

    company_name:
      "TEST FLORIDA COMPANY LLC",

    entity_type:
      "LLC",

    status:
      "ACTIVE",

    principal_address_line1:
      "100 TEST STREET",

    principal_address_line2:
      null,

    principal_city:
      "MIAMI",

    principal_state:
      "FL",

    principal_zip:
      "33144",

    mailing_address_line1:
      "100 TEST STREET",

    mailing_address_line2:
      null,

    mailing_city:
      "MIAMI",

    mailing_state:
      "FL",

    mailing_zip:
      "33144",

    registered_agent_name:
      "TEST AGENT"
  },

  entityContext: {
    classificationCode:
      "238210",

    entityType:
      "LLC",

    location: {
      state:
        "FL",

      city:
        "Miami",

      county:
        "Miami-Dade",

      zip:
        "33144"
    }
  },

  customerProfile: {
    profileId:
      "pilot-customer-001",

    geography: {
      states: [
        "FL"
      ],

      cities: [
        "MIAMI"
      ],

      counties: [],

      zips: []
    },

    industryClassifications: [
      "238210"
    ],

    entityTypes: [
      "LLC"
    ],

    targetCommercialEventTypes: [
      "ENTITY_ACTIVATION"
    ],

    maxSignalAgeHours:
      24
  },

  lead: {
    prospectId:
      "prospect_test_activation",

    prospectName:
      "TEST FLORIDA COMPANY LLC",

    location: {
      state:
        "FL",

      city:
        "Miami",

      county:
        "Miami-Dade",

      zip:
        "33144"
    },

    locationDisplay:
      "Miami, FL",

    entity: {
      registrationId:
        "L26000432480",

      companyName:
        "TEST FLORIDA COMPANY LLC",

      status:
        "ACTIVE",

      entityType:
        "LLC",

      classificationCode:
        "238210"
    },

    score:
      90,

    priority:
      "HIGH PRIORITY",

    qualificationReasons: [
      "Verified ACTIVE state registration."
    ],

    salesSignals: [],

    recommendedAction:
      "Review activation trigger and initiate appropriate outreach.",

    evidenceSummary: [
      "Verified Florida registry observation."
    ],

    evidenceLedger: {
      inputSignalId:
        "sig_test_activation",

      contentHash:
        "sha256_test_activation_content",

      signalRecordHash:
        "sha256_test_activation_signal"
    }
  },

  detectedAt:
    "2026-08-30T18:00:00.000Z",

  asOf:
    "2026-08-30T22:00:00.000Z",

  sourceType:
    "official_state_dataset",

  sourceReference: {
    state:
      "FL",

    registrationId:
      "L26000432480"
  },

  evidenceHash:
    "evidence_activation_001"
};

function request(
  body,
  httpMethod = "POST",
  token = "valid-test-token"
) {
  return {
    httpMethod,

    headers: token
      ? {
          Authorization:
            `Bearer ${token}`
        }
      : {},

    body:
      typeof body === "string"
        ? body
        : JSON.stringify(body)
  };
}

async function run() {
  console.log(
    "1. OPTIONS preflight succeeds"
  );

  const options =
    await handler({
      httpMethod:
        "OPTIONS"
    });

  assert.equal(
    options.statusCode,
    200
  );

  assert.equal(
    options.body,
    ""
  );

  console.log(
    "2. unsupported HTTP method is rejected"
  );

  const getResponse =
    await handler({
      httpMethod:
        "GET"
    });

  assert.equal(
    getResponse.statusCode,
    405
  );

  const getPayload =
    JSON.parse(
      getResponse.body
    );

  assert.equal(
    getPayload.status,
    "error"
  );

  console.log(
    "3. POST without authentication is rejected"
  );

  const missingAuth =
    await handler(
      request(
        baseBody,
        "POST",
        null
      )
    );

  assert.equal(
    missingAuth.statusCode,
    401
  );

  console.log(
    "4. POST with invalid Firebase token is rejected"
  );

  const invalidAuth =
    await handler(
      request(
        baseBody,
        "POST",
        "invalid-test-token"
      )
    );

  assert.equal(
    invalidAuth.statusCode,
    401
  );

  console.log(
    "5. invalid JSON is rejected after authentication"
  );

  const invalidJson =
    await handler(
      request(
        "{not-json"
      )
    );

  assert.equal(
    invalidJson.statusCode,
    400
  );

  console.log(
    "6. matched activation returns JSON opportunity"
  );

  const jsonResponse =
    await handler(
      request(
        baseBody
      )
    );

  assert.equal(
    jsonResponse.statusCode,
    200
  );

  assert.match(
    jsonResponse.headers[
      "Content-Type"
    ],
    /application\/json/
  );

  const payload =
    JSON.parse(
      jsonResponse.body
    );

  assert.equal(
    payload.status,
    "success"
  );

  assert.equal(
    payload.count,
    1
  );

  assert.equal(
    payload.opportunities.length,
    1
  );

  assert.equal(
    payload.exportRows.length,
    1
  );

  assert.equal(
    payload.opportunities[0]
      .commercialEventType,
    "ENTITY_ACTIVATION"
  );

  assert.equal(
    payload.exportRows[0]
      .commercialTrigger,
    "ENTITY_ACTIVATION"
  );

  console.log(
    "7. non-matching customer profile filters opportunity"
  );

  const mismatchBody = {
    ...baseBody,

    customerProfile: {
      ...baseBody.customerProfile,

      geography: {
        states: [
          "TX"
        ],

        cities: [],

        counties: [],

        zips: []
      }
    }
  };

  const mismatchResponse =
    await handler(
      request(
        mismatchBody
      )
    );

  assert.equal(
    mismatchResponse.statusCode,
    200
  );

  const mismatchPayload =
    JSON.parse(
      mismatchResponse.body
    );

  assert.equal(
    mismatchPayload.count,
    0
  );

  assert.deepEqual(
    mismatchPayload.opportunities,
    []
  );

  console.log(
    "8. replay returns deterministic opportunity identity"
  );

  const replayResponse =
    await handler(
      request(
        baseBody
      )
    );

  const replayPayload =
    JSON.parse(
      replayResponse.body
    );

  assert.equal(
    replayPayload.opportunities[0]
      .opportunityId,
    payload.opportunities[0]
      .opportunityId
  );

  console.log(
    "9. CSV format returns downloadable CSV"
  );

  const csvBody = {
    ...baseBody,
    format:
      "csv"
  };

  const csvResponse =
    await handler(
      request(
        csvBody
      )
    );

  assert.equal(
    csvResponse.statusCode,
    200
  );

  assert.match(
    csvResponse.headers[
      "Content-Type"
    ],
    /text\/csv/
  );

  assert.equal(
    csvResponse.headers[
      "Content-Disposition"
    ],
    'attachment; filename="opportunities.csv"'
  );

  assert.ok(
    csvResponse.body.includes(
      "Opportunity ID,Company,Registration ID"
    )
  );

  assert.ok(
    csvResponse.body.includes(
      "TEST FLORIDA COMPANY LLC"
    )
  );

  console.log(
    "10. invalid format is rejected"
  );

  const invalidFormat =
    await handler(
      request({
        ...baseBody,
        format:
          "xlsx"
      })
    );

  assert.equal(
    invalidFormat.statusCode,
    400
  );

  console.log(
    "11. invalid detectedAt is rejected as client error"
  );

  const invalidTimestamp =
    await handler(
      request({
        ...baseBody,
        detectedAt:
          "not-a-date"
      })
    );

  assert.equal(
    invalidTimestamp.statusCode,
    400
  );

  console.log(
    "12. missing customer profile ID is rejected"
  );

  const missingProfileId =
    await handler(
      request({
        ...baseBody,

        customerProfile: {
          ...baseBody.customerProfile,
          profileId:
            ""
        }
      })
    );

  assert.equal(
    missingProfileId.statusCode,
    400
  );

  console.log(
    "13. mismatched registration IDs are rejected"
  );

  const mismatchedEntity =
    await handler(
      request({
        ...baseBody,

        after: {
          ...baseBody.after,
          registration_id:
            "L99999999999"
        }
      })
    );

  assert.equal(
    mismatchedEntity.statusCode,
    400
  );

  console.log(
    "14. invalid optional asOf timestamp is rejected"
  );

  const invalidAsOf =
    await handler(
      request({
        ...baseBody,
        asOf:
          "definitely-not-a-date"
      })
    );

  assert.equal(
    invalidAsOf.statusCode,
    400
  );

  console.log("");
  console.log(
    "Opportunity Preview handler test PASSED."
  );
}

run()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
