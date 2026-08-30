const assert = require("node:assert/strict");

const {
  COMMERCIAL_EVENT_TYPES,
  translateNormalizedChangeEvent
} = require("./CommercialEventTranslator.js");

function makeEvent(
  eventType,
  before = null,
  after = null
) {
  return {
    eventId:
      `evt_test_${eventType}`,

    entityId:
      "L26000432480",

    eventType,

    detectedAt:
      "2026-08-30T18:00:00.000Z",

    effectiveAt:
      null,

    sourceType:
      "official_state_dataset",

    sourceReference: {
      state: "FL",
      registrationId:
        "L26000432480"
    },

    before,
    after,

    evidenceHash:
      null
  };
}

function run() {
  console.log(
    "1. commercial vocabulary is stable"
  );

  assert.deepEqual(
    COMMERCIAL_EVENT_TYPES,
    [
      "ENTITY_FORMATION",
      "ENTITY_STATUS_CHANGE",
      "ENTITY_ACTIVATION",
      "LOCATION_CHANGE",
      "COMPLIANCE_CHANGE",
      "LEADERSHIP_CHANGE"
    ]
  );

  console.log(
    "2. entity creation becomes formation"
  );

  let result =
    translateNormalizedChangeEvent(
      makeEvent(
        "ENTITY_CREATED"
      )
    );

  assert.equal(
    result.commercialEventType,
    "ENTITY_FORMATION"
  );

  console.log(
    "3. status becoming ACTIVE becomes activation"
  );

  result =
    translateNormalizedChangeEvent(
      makeEvent(
        "STATUS_CHANGED",
        {
          status: "INACTIVE"
        },
        {
          status: "ACTIVE"
        }
      )
    );

  assert.equal(
    result.commercialEventType,
    "ENTITY_ACTIVATION"
  );

  assert.equal(
    result.reasonCode,
    "STATUS_BECAME_ACTIVE"
  );

  console.log(
    "4. other status changes remain status changes"
  );

  result =
    translateNormalizedChangeEvent(
      makeEvent(
        "STATUS_CHANGED",
        {
          status: "ACTIVE"
        },
        {
          status: "INACTIVE"
        }
      )
    );

  assert.equal(
    result.commercialEventType,
    "ENTITY_STATUS_CHANGE"
  );

  console.log(
    "5. principal address becomes location change"
  );

  result =
    translateNormalizedChangeEvent(
      makeEvent(
        "PRINCIPAL_ADDRESS_CHANGED"
      )
    );

  assert.equal(
    result.commercialEventType,
    "LOCATION_CHANGE"
  );

  assert.equal(
    result.reasonCode,
    "PRINCIPAL_ADDRESS_CHANGED"
  );

  console.log(
    "6. mailing address becomes location change"
  );

  result =
    translateNormalizedChangeEvent(
      makeEvent(
        "MAILING_ADDRESS_CHANGED"
      )
    );

  assert.equal(
    result.commercialEventType,
    "LOCATION_CHANGE"
  );

  assert.equal(
    result.reasonCode,
    "MAILING_ADDRESS_CHANGED"
  );

  console.log(
    "7. registered-agent change becomes compliance change"
  );

  result =
    translateNormalizedChangeEvent(
      makeEvent(
        "REGISTERED_AGENT_CHANGED"
      )
    );

  assert.equal(
    result.commercialEventType,
    "COMPLIANCE_CHANGE"
  );

  console.log(
    "8. officer added becomes leadership change"
  );

  result =
    translateNormalizedChangeEvent(
      makeEvent(
        "OFFICER_ADDED"
      )
    );

  assert.equal(
    result.commercialEventType,
    "LEADERSHIP_CHANGE"
  );

  assert.equal(
    result.reasonCode,
    "OFFICER_ADDED"
  );

  console.log(
    "9. officer removed becomes leadership change"
  );

  result =
    translateNormalizedChangeEvent(
      makeEvent(
        "OFFICER_REMOVED"
      )
    );

  assert.equal(
    result.commercialEventType,
    "LEADERSHIP_CHANGE"
  );

  console.log(
    "10. officer changed becomes leadership change"
  );

  result =
    translateNormalizedChangeEvent(
      makeEvent(
        "OFFICER_CHANGED"
      )
    );

  assert.equal(
    result.commercialEventType,
    "LEADERSHIP_CHANGE"
  );

  console.log(
    "11. unsupported raw event is rejected"
  );

  assert.throws(
    () =>
      translateNormalizedChangeEvent(
        makeEvent(
          "UNKNOWN_CHANGE"
        )
      ),
    /Unsupported normalized event type/
  );

  console.log("");
  console.log(
    "Commercial Event Translator test PASSED."
  );
}

run();
