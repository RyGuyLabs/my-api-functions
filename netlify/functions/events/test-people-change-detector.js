const assert = require("node:assert/strict");

const {
  detectPeopleChanges
} = require("./PeopleChangeDetector.js");

const A = {
  title: "AMBR",
  name: "OFFICER A",
  address: {
    line1: "100 A STREET",
    line2: null,
    city: "MIAMI",
    state: "FL",
    zip: "33144"
  }
};

const B = {
  title: "MGR",
  name: "OFFICER B",
  address: {
    line1: "200 B STREET",
    line2: null,
    city: "MIAMI",
    state: "FL",
    zip: "33144"
  }
};

const C = {
  title: "CEO",
  name: "OFFICER C",
  address: {
    line1: "300 C STREET",
    line2: null,
    city: "MIAMI",
    state: "FL",
    zip: "33144"
  }
};

function detect(beforePeople, afterPeople) {
  return detectPeopleChanges({
    entityId: "L26000432480",
    beforePeople,
    afterPeople,
    detectedAt:
      "2026-08-30T17:00:00.000Z",
    sourceType:
      "official_state_dataset",
    sourceReference: {
      state: "FL",
      registrationId:
        "L26000432480"
    }
  });
}

function run() {
  console.log(
    "1. identical people emit no events"
  );

  let events =
    detect(
      [A, B],
      [A, B]
    );

  assert.equal(
    events.length,
    0
  );

  console.log(
    "2. reordered people emit no events"
  );

  events =
    detect(
      [A, B],
      [B, A]
    );

  assert.equal(
    events.length,
    0
  );

  console.log(
    "3. added officer detected"
  );

  events =
    detect(
      [A],
      [A, B]
    );

  assert.equal(
    events.length,
    1
  );

  assert.equal(
    events[0].eventType,
    "OFFICER_ADDED"
  );

  assert.equal(
    events[0].after.name,
    "OFFICER B"
  );

  console.log(
    "4. removed officer detected"
  );

  events =
    detect(
      [A, B],
      [A]
    );

  assert.equal(
    events.length,
    1
  );

  assert.equal(
    events[0].eventType,
    "OFFICER_REMOVED"
  );

  assert.equal(
    events[0].before.name,
    "OFFICER B"
  );

  console.log(
    "5. replacement yields remove plus add"
  );

  events =
    detect(
      [A, B],
      [A, C]
    );

  assert.deepEqual(
    events.map(event => event.eventType),
    [
      "OFFICER_REMOVED",
      "OFFICER_ADDED"
    ]
  );

  assert.equal(
    events[0].before.name,
    "OFFICER B"
  );

  assert.equal(
    events[1].after.name,
    "OFFICER C"
  );

  console.log(
    "6. empty to populated detects additions"
  );

  events =
    detect(
      [],
      [A, B]
    );

  assert.equal(
    events.length,
    2
  );

  assert.ok(
    events.every(
      event =>
        event.eventType ===
        "OFFICER_ADDED"
    )
  );

  console.log(
    "7. exact duplicate rows are ignored"
  );

  events =
    detect(
      [A, B],
      [A, B, B]
    );

  assert.equal(
    events.length,
    0
  );

  console.log(
    "8. populated to empty detects removals"
  );

  events =
    detect(
      [A, B],
      []
    );

  assert.equal(
    events.length,
    2
  );

  assert.ok(
    events.every(
      event =>
        event.eventType ===
        "OFFICER_REMOVED"
    )
  );

  console.log("");
  console.log(
    "People Change Detector test PASSED."
  );
}

run();
