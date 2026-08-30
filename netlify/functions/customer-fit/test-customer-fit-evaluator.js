const assert = require("node:assert/strict");

const {
  evaluateCustomerFit
} = require("./CustomerFitEvaluator.js");

const AS_OF =
  "2026-08-30T18:00:00.000Z";

const event = {
  entityId:
    "L26000432480",

  commercialEventType:
    "LEADERSHIP_CHANGE",

  occurredAt:
    "2026-08-30T10:00:00.000Z",

  detectedAt:
    "2026-08-30T10:00:00.000Z"
};

const entity = {
  entityType:
    "LLC",

  classificationCode:
    "238210",

  location: {
    state: "FL",
    city: "Miami",
    county: "Miami-Dade",
    zip: "33144"
  }
};

function makeProfile(overrides = {}) {
  return {
    profileId:
      "pilot-001",

    geography: {
      states: ["FL"],
      cities: [],
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
      "LEADERSHIP_CHANGE",
      "ENTITY_ACTIVATION"
    ],

    maxSignalAgeHours:
      72,

    ...overrides
  };
}

function evaluate(
  profile = makeProfile(),
  entityContext = entity,
  commercialEvent = event
) {
  return evaluateCustomerFit({
    commercialEvent,
    entityContext,
    customerProfile:
      profile,
    asOf:
      AS_OF
  });
}

function run() {
  console.log(
    "1. matching customer profile qualifies event"
  );

  let result =
    evaluate();

  assert.equal(
    result.matched,
    true
  );

  assert.deepEqual(
    result.failedReasonCodes,
    []
  );

  assert.equal(
    result.signalAgeHours,
    8
  );

  console.log(
    "2. state mismatch rejects event"
  );

  result =
    evaluate(
      makeProfile({
        geography: {
          states: ["GA"]
        }
      })
    );

  assert.equal(
    result.matched,
    false
  );

  assert.ok(
    result.failedReasonCodes.includes(
      "GEOGRAPHY_MISMATCH"
    )
  );

  console.log(
    "3. city targeting is deterministic"
  );

  result =
    evaluate(
      makeProfile({
        geography: {
          states: ["FL"],
          cities: ["MIAMI"]
        }
      })
    );

  assert.equal(
    result.matched,
    true
  );

  console.log(
    "4. classification mismatch rejects event"
  );

  result =
    evaluate(
      makeProfile({
        industryClassifications: [
          "238220"
        ]
      })
    );

  assert.equal(
    result.matched,
    false
  );

  assert.ok(
    result.failedReasonCodes.includes(
      "CLASSIFICATION_MISMATCH"
    )
  );

  console.log(
    "5. entity type is evaluated independently"
  );

  result =
    evaluate(
      makeProfile({
        entityTypes: [
          "CORP"
        ]
      })
    );

  assert.equal(
    result.matched,
    false
  );

  assert.ok(
    result.failedReasonCodes.includes(
      "ENTITY_TYPE_MISMATCH"
    )
  );

  console.log(
    "6. unwanted commercial event type is rejected"
  );

  result =
    evaluate(
      makeProfile({
        targetCommercialEventTypes: [
          "ENTITY_ACTIVATION"
        ]
      })
    );

  assert.equal(
    result.matched,
    false
  );

  assert.ok(
    result.failedReasonCodes.includes(
      "EVENT_TYPE_MISMATCH"
    )
  );

  console.log(
    "7. fresh event satisfies age rule"
  );

  result =
    evaluate();

  assert.ok(
    result.reasonCodes.includes(
      "SIGNAL_AGE_MATCH"
    )
  );

  console.log(
    "8. stale event is rejected"
  );

  result =
    evaluate(
      makeProfile({
        maxSignalAgeHours:
          4
      })
    );

  assert.equal(
    result.matched,
    false
  );

  assert.ok(
    result.failedReasonCodes.includes(
      "SIGNAL_AGE_MISMATCH"
    )
  );

  console.log(
    "9. future-dated event is rejected"
  );

  result =
    evaluate(
      makeProfile(),
      entity,
      {
        ...event,
        occurredAt:
          "2026-08-30T20:00:00.000Z"
      }
    );

  assert.equal(
    result.matched,
    false
  );

  assert.ok(
    result.failedReasonCodes.includes(
      "SIGNAL_AGE_MISMATCH"
    )
  );

  console.log(
    "10. empty geography rule means unrestricted geography"
  );

  result =
    evaluate(
      makeProfile({
        geography: {}
      })
    );

  assert.equal(
    result.matched,
    true
  );

  console.log(
    "11. empty classification rule means unrestricted classification"
  );

  result =
    evaluate(
      makeProfile({
        industryClassifications: []
      })
    );

  assert.equal(
    result.matched,
    true
  );

  console.log(
    "12. missing event targets are rejected as invalid profile"
  );

  assert.throws(
    () =>
      evaluateCustomerFit({
        commercialEvent:
          event,
        entityContext:
          entity,
        customerProfile: {
          profileId:
            "invalid",
          geography: {},
          industryClassifications: [],
          entityTypes: [],
          targetCommercialEventTypes: [],
          maxSignalAgeHours:
            72
        },
        asOf:
          AS_OF
      }),
    /at least one target commercial event type/
  );

  console.log(
    "13. blank signal age is rejected as invalid profile"
  );

  assert.throws(
    () =>
      evaluateCustomerFit({
        commercialEvent:
          event,
        entityContext:
          entity,
        customerProfile: {
          ...makeProfile(),
          maxSignalAgeHours:
            null
        },
        asOf:
          AS_OF
      }),
    /non-negative maxSignalAgeHours/
  );

  console.log("");
  console.log(
    "Customer Fit Evaluator test PASSED."
  );
}

run();
