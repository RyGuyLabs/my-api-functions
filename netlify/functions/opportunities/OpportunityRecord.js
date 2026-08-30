const crypto = require("crypto");

const {
  toCanonicalString
} = require("../source/CanonicalSerializer.js");

function cloneAndFreeze(value) {
  if (
    value === null ||
    typeof value !== "object"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return Object.freeze(
      value.map(cloneAndFreeze)
    );
  }

  const clone = {};

  for (
    const [key, childValue] of
      Object.entries(value)
  ) {
    clone[key] =
      cloneAndFreeze(childValue);
  }

  return Object.freeze(clone);
}

function buildOpportunityRecord({
  lead,
  normalizedEvent,
  commercialEvent,
  customerFit
}) {
  if (
    !lead ||
    typeof lead !== "object"
  ) {
    throw new Error(
      "OpportunityRecord requires a lead."
    );
  }

  if (
    !normalizedEvent ||
    !normalizedEvent.eventId
  ) {
    throw new Error(
      "OpportunityRecord requires a normalized event."
    );
  }

  if (
    !commercialEvent ||
    !commercialEvent.commercialEventType
  ) {
    throw new Error(
      "OpportunityRecord requires a commercial event."
    );
  }

  if (
    !customerFit ||
    customerFit.matched !== true
  ) {
    throw new Error(
      "OpportunityRecord requires a matched customer-fit result."
    );
  }

  const customerProfileId =
    customerFit.profileId || null;

  if (!customerProfileId) {
    throw new Error(
      "OpportunityRecord requires customer profileId."
    );
  }

  const deterministicContent = {
    normalizedEventId:
      normalizedEvent.eventId,

    customerProfileId
  };

  const opportunityHash =
    crypto
      .createHash("sha256")
      .update(
        toCanonicalString(
          deterministicContent
        )
      )
      .digest("hex");

  const evidence = {
    normalizedEventId:
      normalizedEvent.eventId,

    eventHash:
      normalizedEvent.eventHash ||
      null,

    evidenceHash:
      normalizedEvent.evidenceHash ||
      commercialEvent.evidenceHash ||
      null,

    sourceType:
      normalizedEvent.sourceType ||
      commercialEvent.sourceType ||
      null,

    sourceReference:
      normalizedEvent.sourceReference ||
      commercialEvent.sourceReference ||
      null,

    evidenceLedger:
      lead.evidenceLedger ||
      null
  };

  const leadSnapshot = Object.freeze({
    prospectId:
      lead.prospectId ||
      null,

    prospectName:
      lead.prospectName ||
      null,

    location:
      cloneAndFreeze(
        lead.location ||
        null
      ),

    locationDisplay:
      lead.locationDisplay ||
      null,

    entity:
      cloneAndFreeze(
        lead.entity ||
        null
      ),

    score:
      lead.score ?? null,

    priority:
      lead.priority ||
      null,

    qualificationReasons:
      Array.isArray(
        lead.qualificationReasons
      )
        ? [...lead.qualificationReasons]
        : [],

    salesSignals:
      Array.isArray(
        lead.salesSignals
      )
        ? [...lead.salesSignals]
        : [],

    recommendedAction:
      lead.recommendedAction ||
      null,

    evidenceSummary:
      Array.isArray(
        lead.evidenceSummary
      )
        ? [...lead.evidenceSummary]
        : []
  });

  return Object.freeze({
    opportunityId:
      `opp_${opportunityHash}`,

    prospectId:
      lead.prospectId ||
      null,

    prospectName:
      lead.prospectName ||
      null,

    entityId:
      commercialEvent.entityId ||
      normalizedEvent.entityId ||
      null,

    normalizedEventId:
      normalizedEvent.eventId,

    commercialEventType:
      commercialEvent.commercialEventType,

    commercialReasonCode:
      commercialEvent.reasonCode ||
      null,

    occurredAt:
      commercialEvent.occurredAt ||
      normalizedEvent.effectiveAt ||
      normalizedEvent.detectedAt ||
      null,

    detectedAt:
      commercialEvent.detectedAt ||
      normalizedEvent.detectedAt ||
      null,

    customerProfileId,

    whyThisCustomer:
      Array.isArray(
        customerFit.reasonCodes
      )
        ? [...customerFit.reasonCodes]
        : [],

    signalAgeHours:
      customerFit.signalAgeHours ?? null,

    evidence,

    lead:
      leadSnapshot
  });
}

module.exports = {
  buildOpportunityRecord
};
