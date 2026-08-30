function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function stringifySourceReference(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value);
}

function toOpportunityExportRow(opportunity) {
  if (
    !opportunity ||
    typeof opportunity !== "object"
  ) {
    throw new Error(
      "OpportunityExport requires an opportunity record."
    );
  }

  if (!opportunity.opportunityId) {
    throw new Error(
      "OpportunityExport requires opportunityId."
    );
  }

  const lead =
    opportunity.lead || {};

  const entity =
    lead.entity || {};

  const evidence =
    opportunity.evidence || {};

  return Object.freeze({
    opportunityId:
      opportunity.opportunityId,

    company:
      opportunity.prospectName ||
      lead.prospectName ||
      entity.companyName ||
      "",

    registrationId:
      entity.registrationId ||
      entity.registration_id ||
      opportunity.entityId ||
      "",

    location:
      lead.locationDisplay ||
      "",

    entityType:
      entity.entityType ||
      entity.entity_type ||
      "",

    commercialTrigger:
      opportunity.commercialEventType ||
      "",

    triggerReason:
      opportunity.commercialReasonCode ||
      "",

    whyThisCustomer:
      safeArray(
        opportunity.whyThisCustomer
      ).join(" | "),

    occurredAt:
      opportunity.occurredAt ||
      "",

    detectedAt:
      opportunity.detectedAt ||
      "",

    signalAgeHours:
      opportunity.signalAgeHours ??
      "",

    qualificationScore:
      lead.score ??
      "",

    priority:
      lead.priority ||
      "",

    recommendedAction:
      lead.recommendedAction ||
      "",

    sourceType:
      evidence.sourceType ||
      "",

    sourceReference:
      stringifySourceReference(
        evidence.sourceReference
      ),

    normalizedEventId:
      opportunity.normalizedEventId ||
      evidence.normalizedEventId ||
      "",

    evidenceHash:
      evidence.evidenceHash ||
      ""
  });
}

function escapeCsvValue(value) {
  const text =
    value === null ||
    value === undefined
      ? ""
      : String(value);

  if (
    text.includes(",") ||
    text.includes('"') ||
    text.includes("\n") ||
    text.includes("\r")
  ) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

const CSV_COLUMNS = Object.freeze([
  ["opportunityId", "Opportunity ID"],
  ["company", "Company"],
  ["registrationId", "Registration ID"],
  ["location", "Location"],
  ["entityType", "Entity Type"],
  ["commercialTrigger", "Commercial Trigger"],
  ["triggerReason", "Trigger Reason"],
  ["whyThisCustomer", "Why This Customer"],
  ["occurredAt", "Occurred At"],
  ["detectedAt", "Detected At"],
  ["signalAgeHours", "Signal Age Hours"],
  ["qualificationScore", "Qualification Score"],
  ["priority", "Priority"],
  ["recommendedAction", "Recommended Action"],
  ["sourceType", "Source Type"],
  ["sourceReference", "Source Reference"],
  ["normalizedEventId", "Normalized Event ID"],
  ["evidenceHash", "Evidence Hash"]
]);

function opportunitiesToCsv(opportunities) {
  if (!Array.isArray(opportunities)) {
    throw new Error(
      "OpportunityExport requires an array of opportunities."
    );
  }

  const rows =
    opportunities.map(
      toOpportunityExportRow
    );

  const header =
    CSV_COLUMNS
      .map(([, label]) =>
        escapeCsvValue(label)
      )
      .join(",");

  const dataLines =
    rows.map(row =>
      CSV_COLUMNS
        .map(([key]) =>
          escapeCsvValue(
            row[key]
          )
        )
        .join(",")
    );

  return [
    header,
    ...dataLines
  ].join("\n");
}

module.exports = {
  CSV_COLUMNS,
  toOpportunityExportRow,
  opportunitiesToCsv,
  escapeCsvValue
};
