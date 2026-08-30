const assert = require("node:assert/strict");

const {
  VALID_EVENT_TYPES,
  buildNormalizedChangeEvent
} = require("./NormalizedChangeEvent.js");

function run() {
  console.log("1. supported event vocabulary");

  assert.ok(
    VALID_EVENT_TYPES.includes("STATUS_CHANGED")
  );

  assert.ok(
    VALID_EVENT_TYPES.includes("OFFICER_ADDED")
  );

  console.log("2. deterministic event identity");

  const first =
    buildNormalizedChangeEvent({
      entityId: "L26000432480",
      eventType: "STATUS_CHANGED",
      detectedAt: "2026-08-30T16:00:00.000Z",
      effectiveAt: "2026-08-30T15:00:00.000Z",
      sourceType: "official_state_dataset",
      sourceReference: {
        state: "FL",
        registrationId: "L26000432480"
      },
      before: {
        status: "ACTIVE",
        companyName: "TEST LLC"
      },
      after: {
        status: "INACTIVE",
        companyName: "TEST LLC"
      },
      evidenceHash: "abc123"
    });

  const reordered =
    buildNormalizedChangeEvent({
      entityId: "L26000432480",
      eventType: "STATUS_CHANGED",

      // Detection time is operational metadata and must
      // not change deterministic event identity.
      detectedAt: "2026-08-30T17:00:00.000Z",

      effectiveAt: "2026-08-30T15:00:00.000Z",
      sourceType: "official_state_dataset",

      sourceReference: {
        registrationId: "L26000432480",
        state: "FL"
      },

      before: {
        companyName: "TEST LLC",
        status: "ACTIVE"
      },

      after: {
        companyName: "TEST LLC",
        status: "INACTIVE"
      },

      evidenceHash: "abc123"
    });

  assert.equal(
    first.eventHash,
    reordered.eventHash
  );

  assert.equal(
    first.eventId,
    reordered.eventId
  );

  assert.notEqual(
    first.detectedAt,
    reordered.detectedAt
  );

  console.log("3. actual change alters event identity");

  const different =
    buildNormalizedChangeEvent({
      entityId: "L26000432480",
      eventType: "STATUS_CHANGED",
      detectedAt: "2026-08-30T17:00:00.000Z",
      effectiveAt: "2026-08-30T15:00:00.000Z",
      sourceType: "official_state_dataset",
      sourceReference: {
        state: "FL",
        registrationId: "L26000432480"
      },
      before: {
        status: "ACTIVE",
        companyName: "TEST LLC"
      },
      after: {
        status: "DISSOLVED",
        companyName: "TEST LLC"
      },
      evidenceHash: "abc123"
    });

  assert.notEqual(
    first.eventHash,
    different.eventHash
  );

  console.log("4. invalid event type rejected");

  assert.throws(
    () =>
      buildNormalizedChangeEvent({
        entityId: "L26000432480",
        eventType: "RANDOM_EVENT",
        sourceType: "official_state_dataset"
      }),
    /Unsupported normalized event type/
  );

  console.log("");
  console.log(
    "Normalized Change Event contract test PASSED."
  );
}

run();
