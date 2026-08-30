const {
  detectEntityChanges
} = require("./events/EntityChangeDetector.js");

const {
  translateNormalizedChangeEvent
} = require("./events/CommercialEventTranslator.js");

const {
  evaluateCustomerFit
} = require("./customer-fit/CustomerFitEvaluator.js");

const {
  buildOpportunityRecord
} = require("./opportunities/OpportunityRecord.js");

const {
  toOpportunityExportRow,
  opportunitiesToCsv
} = require("./exports/OpportunityExport.js");

const ALLOWED_ORIGIN =
  "https://www.ryguylabs.com";

function headers(contentType = "application/json") {
  return {
    "Access-Control-Allow-Origin":
      ALLOWED_ORIGIN,

    "Access-Control-Allow-Headers":
      "Content-Type",

    "Access-Control-Allow-Methods":
      "POST, OPTIONS",

    "Content-Type":
      contentType
  };
}

function jsonResponse(
  statusCode,
  payload
) {
  return {
    statusCode,
    headers:
      headers("application/json"),
    body:
      JSON.stringify(payload)
  };
}

function parseBody(body) {
  let parsed;

  try {
    parsed =
      typeof body === "string"
        ? JSON.parse(body)
        : body;
  } catch {
    const error =
      new Error(
        "Invalid JSON request body."
      );

    error.statusCode = 400;

    throw error;
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  ) {
    const error =
      new Error(
        "Request body must be a JSON object."
      );

    error.statusCode = 400;

    throw error;
  }

  return parsed;
}

function requireObject(
  body,
  key
) {
  const value =
    body[key];

  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    const error =
      new Error(
        `Request requires '${key}'.`
      );

    error.statusCode = 400;

    throw error;
  }

  return value;
}

function badRequest(message) {
  const error =
    new Error(message);

  error.statusCode = 400;

  return error;
}

function requireNonEmptyString(
  value,
  fieldName
) {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw badRequest(
      `Request requires '${fieldName}'.`
    );
  }

  return value.trim();
}

function validateTimestamp(
  value,
  fieldName,
  {
    required = false
  } = {}
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    if (required) {
      throw badRequest(
        `Request requires '${fieldName}'.`
      );
    }

    return null;
  }

  if (
    typeof value !== "string" ||
    Number.isNaN(
      new Date(value).getTime()
    )
  ) {
    throw badRequest(
      `'${fieldName}' must be a valid timestamp.`
    );
  }

  return value;
}

function validateRequestContract({
  before,
  after,
  customerProfile,
  lead,
  body
}) {
  const beforeRegistrationId =
    requireNonEmptyString(
      before.registration_id,
      "before.registration_id"
    );

  const afterRegistrationId =
    requireNonEmptyString(
      after.registration_id,
      "after.registration_id"
    );

  if (
    beforeRegistrationId !==
    afterRegistrationId
  ) {
    throw badRequest(
      "before.registration_id and after.registration_id must match."
    );
  }

  requireNonEmptyString(
    customerProfile.profileId,
    "customerProfile.profileId"
  );

  requireNonEmptyString(
    lead.prospectId,
    "lead.prospectId"
  );

  validateTimestamp(
    body.detectedAt,
    "detectedAt",
    {
      required: true
    }
  );

  validateTimestamp(
    body.effectiveAt,
    "effectiveAt"
  );

  validateTimestamp(
    body.asOf,
    "asOf"
  );
}

async function handler(event) {
  const requestHeaders =
    headers();

  if (
    event &&
    event.httpMethod === "OPTIONS"
  ) {
    return {
      statusCode: 200,
      headers:
        requestHeaders,
      body: ""
    };
  }

  if (
    !event ||
    event.httpMethod !== "POST"
  ) {
    return jsonResponse(
      405,
      {
        status: "error",
        error:
          "Method Not Allowed"
      }
    );
  }

  try {
    const body =
      parseBody(
        event.body
      );

    const before =
      requireObject(
        body,
        "before"
      );

    const after =
      requireObject(
        body,
        "after"
      );

    const entityContext =
      requireObject(
        body,
        "entityContext"
      );

    const customerProfile =
      requireObject(
        body,
        "customerProfile"
      );

    const lead =
      requireObject(
        body,
        "lead"
      );

    validateRequestContract({
      before,
      after,
      customerProfile,
      lead,
      body
    });

    const format =
      String(
        body.format || "json"
      )
        .trim()
        .toLowerCase();

    if (
      format !== "json" &&
      format !== "csv"
    ) {
      const error =
        new Error(
          "Format must be 'json' or 'csv'."
        );

      error.statusCode = 400;

      throw error;
    }

    const normalizedEvents =
      detectEntityChanges({
        before,
        after,
        detectedAt:
          body.detectedAt,
        effectiveAt:
          body.effectiveAt || null,
        sourceType:
          body.sourceType ||
          "official_state_dataset",
        sourceReference:
          body.sourceReference ||
          null,
        evidenceHash:
          body.evidenceHash ||
          null
      });

    const opportunities = [];

    for (
      const normalizedEvent
      of normalizedEvents
    ) {
      const commercialEvent =
        translateNormalizedChangeEvent(
          normalizedEvent
        );

      const customerFit =
        evaluateCustomerFit({
          commercialEvent,
          entityContext,
          customerProfile,
          asOf:
            body.asOf ||
            new Date().toISOString()
        });

      if (!customerFit.matched) {
        continue;
      }

      opportunities.push(
        buildOpportunityRecord({
          lead,
          normalizedEvent,
          commercialEvent,
          customerFit
        })
      );
    }

    if (format === "csv") {
      return {
        statusCode: 200,

        headers: {
          ...headers(
            "text/csv; charset=utf-8"
          ),

          "Content-Disposition":
            'attachment; filename="opportunities.csv"'
        },

        body:
          opportunitiesToCsv(
            opportunities
          )
      };
    }

    return jsonResponse(
      200,
      {
        status:
          "success",

        count:
          opportunities.length,

        opportunities,

        exportRows:
          opportunities.map(
            toOpportunityExportRow
          )
      }
    );
  } catch (error) {
    const statusCode =
      Number.isInteger(
        error &&
        error.statusCode
      )
        ? error.statusCode
        : 500;

    const clientMessage =
      statusCode >= 500
        ? "An error occurred while building opportunity intelligence."
        : error.message;

    if (statusCode >= 500) {
      console.error(
        "Opportunity preview error:",
        error
      );
    }

    return jsonResponse(
      statusCode,
      {
        status: "error",
        error:
          clientMessage,
        opportunities: [],
        exportRows: []
      }
    );
  }
}

exports.handler =
  handler;

module.exports._test = {
  parseBody,
  requireObject,
  requireNonEmptyString,
  validateTimestamp,
  validateRequestContract
};
