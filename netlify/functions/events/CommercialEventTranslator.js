const COMMERCIAL_EVENT_TYPES = Object.freeze([
  "ENTITY_FORMATION",
  "ENTITY_STATUS_CHANGE",
  "ENTITY_ACTIVATION",
  "LOCATION_CHANGE",
  "COMPLIANCE_CHANGE",
  "LEADERSHIP_CHANGE"
]);

function normalizeStatus(value) {
  if (value == null) {
    return null;
  }

  return String(value)
    .trim()
    .toUpperCase();
}

function translateNormalizedChangeEvent(event) {
  if (!event || !event.eventType) {
    throw new Error(
      "CommercialEventTranslator requires a normalized event."
    );
  }

  let commercialEventType = null;
  let reasonCode = null;

  switch (event.eventType) {
    case "ENTITY_CREATED":
      commercialEventType =
        "ENTITY_FORMATION";
      reasonCode =
        "NEW_ENTITY_OBSERVED";
      break;

    case "STATUS_CHANGED": {
      const beforeStatus =
        normalizeStatus(
          event.before &&
          event.before.status
        );

      const afterStatus =
        normalizeStatus(
          event.after &&
          event.after.status
        );

      if (
        afterStatus === "ACTIVE" &&
        beforeStatus !== "ACTIVE"
      ) {
        commercialEventType =
          "ENTITY_ACTIVATION";
        reasonCode =
          "STATUS_BECAME_ACTIVE";
      } else {
        commercialEventType =
          "ENTITY_STATUS_CHANGE";
        reasonCode =
          "ENTITY_STATUS_CHANGED";
      }

      break;
    }

    case "PRINCIPAL_ADDRESS_CHANGED":
      commercialEventType =
        "LOCATION_CHANGE";
      reasonCode =
        "PRINCIPAL_ADDRESS_CHANGED";
      break;

    case "MAILING_ADDRESS_CHANGED":
      commercialEventType =
        "LOCATION_CHANGE";
      reasonCode =
        "MAILING_ADDRESS_CHANGED";
      break;

    case "REGISTERED_AGENT_CHANGED":
      commercialEventType =
        "COMPLIANCE_CHANGE";
      reasonCode =
        "REGISTERED_AGENT_CHANGED";
      break;

    case "OFFICER_ADDED":
      commercialEventType =
        "LEADERSHIP_CHANGE";
      reasonCode =
        "OFFICER_ADDED";
      break;

    case "OFFICER_REMOVED":
      commercialEventType =
        "LEADERSHIP_CHANGE";
      reasonCode =
        "OFFICER_REMOVED";
      break;

    case "OFFICER_CHANGED":
      commercialEventType =
        "LEADERSHIP_CHANGE";
      reasonCode =
        "OFFICER_CHANGED";
      break;

    default:
      throw new Error(
        `Unsupported normalized event type: ${event.eventType}`
      );
  }

  return Object.freeze({
    normalizedEventId:
      event.eventId || null,

    entityId:
      event.entityId,

    commercialEventType,

    reasonCode,

    occurredAt:
      event.effectiveAt ||
      event.detectedAt ||
      null,

    detectedAt:
      event.detectedAt ||
      null,

    sourceType:
      event.sourceType ||
      null,

    sourceReference:
      event.sourceReference ||
      null,

    before:
      event.before ||
      null,

    after:
      event.after ||
      null,

    evidenceHash:
      event.evidenceHash ||
      null
  });
}

module.exports = {
  COMMERCIAL_EVENT_TYPES,
  translateNormalizedChangeEvent
};
