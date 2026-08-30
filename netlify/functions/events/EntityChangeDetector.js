const {
  canonicalEqual
} = require("../source/CanonicalSerializer.js");

const {
  buildNormalizedChangeEvent
} = require("./NormalizedChangeEvent.js");

function normalizeAddress(record, prefix) {
  return {
    line1:
      record[`${prefix}_address_line1`] || null,

    line2:
      record[`${prefix}_address_line2`] || null,

    city:
      record[`${prefix}_city`] || null,

    state:
      record[`${prefix}_state`] || null,

    zip:
      record[`${prefix}_zip`] || null
  };
}

function detectEntityChanges({
  before,
  after,
  detectedAt,
  effectiveAt = null,
  sourceType = "official_state_dataset",
  sourceReference = null,
  evidenceHash = null
}) {
  if (!before || !after) {
    throw new Error(
      "EntityChangeDetector requires before and after records."
    );
  }

  if (
    before.registration_id &&
    after.registration_id &&
    before.registration_id !== after.registration_id
  ) {
    throw new Error(
      "EntityChangeDetector registration_id mismatch."
    );
  }

  const entityId =
    after.registration_id ||
    before.registration_id;

  if (!entityId) {
    throw new Error(
      "EntityChangeDetector requires registration_id."
    );
  }

  const events = [];

  function emit(eventType, previousValue, currentValue) {
    events.push(
      buildNormalizedChangeEvent({
        entityId,
        eventType,
        detectedAt,
        effectiveAt,
        sourceType,
        sourceReference:
          sourceReference || {
            registrationId: entityId
          },
        before: previousValue,
        after: currentValue,
        evidenceHash
      })
    );
  }

  const beforeStatus =
    before.status || null;

  const afterStatus =
    after.status || null;

  if (!canonicalEqual(beforeStatus, afterStatus)) {
    emit(
      "STATUS_CHANGED",
      { status: beforeStatus },
      { status: afterStatus }
    );
  }

  const beforePrincipal =
    normalizeAddress(
      before,
      "principal"
    );

  const afterPrincipal =
    normalizeAddress(
      after,
      "principal"
    );

  if (
    !canonicalEqual(
      beforePrincipal,
      afterPrincipal
    )
  ) {
    emit(
      "PRINCIPAL_ADDRESS_CHANGED",
      beforePrincipal,
      afterPrincipal
    );
  }

  const beforeMailing =
    normalizeAddress(
      before,
      "mailing"
    );

  const afterMailing =
    normalizeAddress(
      after,
      "mailing"
    );

  if (
    !canonicalEqual(
      beforeMailing,
      afterMailing
    )
  ) {
    emit(
      "MAILING_ADDRESS_CHANGED",
      beforeMailing,
      afterMailing
    );
  }

  const beforeAgent =
    before.registered_agent_name || null;

  const afterAgent =
    after.registered_agent_name || null;

  if (!canonicalEqual(beforeAgent, afterAgent)) {
    emit(
      "REGISTERED_AGENT_CHANGED",
      {
        registeredAgent:
          beforeAgent
      },
      {
        registeredAgent:
          afterAgent
      }
    );
  }

  return events;
}

module.exports = {
  detectEntityChanges
};
