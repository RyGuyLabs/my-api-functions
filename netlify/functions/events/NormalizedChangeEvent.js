const crypto = require("crypto");

const {
  toCanonicalString
} = require("../source/CanonicalSerializer.js");

const VALID_EVENT_TYPES = Object.freeze([
  "ENTITY_CREATED",
  "STATUS_CHANGED",
  "PRINCIPAL_ADDRESS_CHANGED",
  "MAILING_ADDRESS_CHANGED",
  "REGISTERED_AGENT_CHANGED",
  "OFFICER_ADDED",
  "OFFICER_REMOVED",
  "OFFICER_CHANGED"
]);

function buildNormalizedChangeEvent({
  entityId,
  eventType,
  detectedAt,
  effectiveAt = null,
  sourceType,
  sourceReference = null,
  before = null,
  after = null,
  evidenceHash = null
}) {
  if (!entityId) {
    throw new Error("NormalizedChangeEvent requires entityId.");
  }

  if (!VALID_EVENT_TYPES.includes(eventType)) {
    throw new Error(
      `Unsupported normalized event type: ${eventType}`
    );
  }

  if (!sourceType) {
    throw new Error("NormalizedChangeEvent requires sourceType.");
  }

  const observedAt =
    detectedAt || new Date().toISOString();

  const deterministicContent = {
    entityId,
    eventType,
    effectiveAt,
    sourceType,
    sourceReference,
    before,
    after,
    evidenceHash
  };

  const eventHash =
    crypto
      .createHash("sha256")
      .update(
        toCanonicalString(deterministicContent)
      )
      .digest("hex");

  return Object.freeze({
    eventId: `evt_${eventHash}`,
    entityId,
    eventType,
    detectedAt: observedAt,
    effectiveAt,
    sourceType,
    sourceReference,
    before,
    after,
    evidenceHash,
    eventHash
  });
}

module.exports = {
  VALID_EVENT_TYPES,
  buildNormalizedChangeEvent
};
