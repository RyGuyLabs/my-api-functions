const assert = require("node:assert/strict");

const {
  detectEntityChanges
} = require("./EntityChangeDetector.js");

function makeRecord(overrides = {}) {
  return {
    registration_id: "L26000432480",
    company_name: "TEST COMPANY LLC",
    entity_type: "LLC",
    status: "ACTIVE",

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
      "PO BOX 100",
    mailing_address_line2:
      null,
    mailing_city:
      "MIAMI",
    mailing_state:
      "FL",
    mailing_zip:
      "33144",

    registered_agent_name:
      "TEST AGENT",

    source_file:
      "old.txt",
    source_type:
      "official_state_dataset",
    source_retrieved_at:
      "2026-08-30T15:00:00.000Z",
    record_updated_at:
      "2026-08-30T15:00:00.000Z",

    ...overrides
  };
}

function detect(before, after) {
  return detectEntityChanges({
    before,
    after,
    detectedAt:
      "2026-08-30T16:00:00.000Z",
    sourceType:
      "official_state_dataset",
    sourceReference: {
      state: "FL",
      registrationId:
        after.registration_id
    }
  });
}

function run() {
  console.log(
    "1. identical entity emits no events"
  );

  let events =
    detect(
      makeRecord(),
      makeRecord()
    );

  assert.equal(
    events.length,
    0
  );

  console.log(
    "2. source metadata emits no events"
  );

  events =
    detect(
      makeRecord(),
      makeRecord({
        source_file:
          "new.txt",
        source_retrieved_at:
          "2026-08-30T17:00:00.000Z",
        record_updated_at:
          "2026-08-30T17:00:00.000Z"
      })
    );

  assert.equal(
    events.length,
    0
  );

  console.log(
    "3. status change emits STATUS_CHANGED"
  );

  events =
    detect(
      makeRecord(),
      makeRecord({
        status: "INACTIVE"
      })
    );

  assert.equal(
    events.length,
    1
  );

  assert.equal(
    events[0].eventType,
    "STATUS_CHANGED"
  );

  assert.deepEqual(
    events[0].before,
    {
      status: "ACTIVE"
    }
  );

  assert.deepEqual(
    events[0].after,
    {
      status: "INACTIVE"
    }
  );

  console.log(
    "4. principal address change detected"
  );

  events =
    detect(
      makeRecord(),
      makeRecord({
        principal_address_line1:
          "200 NEW STREET"
      })
    );

  assert.equal(
    events.length,
    1
  );

  assert.equal(
    events[0].eventType,
    "PRINCIPAL_ADDRESS_CHANGED"
  );

  console.log(
    "5. mailing address change detected"
  );

  events =
    detect(
      makeRecord(),
      makeRecord({
        mailing_zip:
          "33145"
      })
    );

  assert.equal(
    events.length,
    1
  );

  assert.equal(
    events[0].eventType,
    "MAILING_ADDRESS_CHANGED"
  );

  console.log(
    "6. registered-agent change detected"
  );

  events =
    detect(
      makeRecord(),
      makeRecord({
        registered_agent_name:
          "NEW REGISTERED AGENT"
      })
    );

  assert.equal(
    events.length,
    1
  );

  assert.equal(
    events[0].eventType,
    "REGISTERED_AGENT_CHANGED"
  );

  console.log(
    "7. multiple real changes emit multiple events"
  );

  events =
    detect(
      makeRecord(),
      makeRecord({
        status:
          "INACTIVE",
        principal_city:
          "ORLANDO",
        registered_agent_name:
          "NEW REGISTERED AGENT"
      })
    );

  assert.deepEqual(
    events.map(
      event => event.eventType
    ),
    [
      "STATUS_CHANGED",
      "PRINCIPAL_ADDRESS_CHANGED",
      "REGISTERED_AGENT_CHANGED"
    ]
  );

  console.log(
    "8. mismatched entity IDs are rejected"
  );

  assert.throws(
    () =>
      detectEntityChanges({
        before:
          makeRecord({
            registration_id: "ENTITY_A"
          }),
        after:
          makeRecord({
            registration_id: "ENTITY_B"
          }),
        detectedAt:
          "2026-08-30T16:00:00.000Z",
        sourceType:
          "official_state_dataset"
      }),
    /registration_id mismatch/
  );

  console.log("");
  console.log(
    "Entity Change Detector test PASSED."
  );
}

run();
