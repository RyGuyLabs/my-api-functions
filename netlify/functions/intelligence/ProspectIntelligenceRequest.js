const {
  buildSalesContext
} = require(
  "./SalesContext.js"
);

const VALID_RESEARCH_SCOPES =
  new Set([
    "COMPANY_CONTEXT",
    "CURRENT_DEVELOPMENTS",
    "SALES_RELEVANCE",
    "CONVERSATION_STARTERS",
    "DISCOVERY_QUESTIONS",
    "OBJECTION_PREPARATION",
    "RECOMMENDED_APPROACH",
    "OUTREACH_IDEA"
  ]);

function cleanString(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const clean =
    String(value)
      .replace(/\s+/g, " ")
      .trim();

  return clean || null;
}

function cleanArray(
  value
) {
  return Array.isArray(value)
    ? value.filter(Boolean)
    : [];
}

function normalizeResearchScopes(
  value
) {
  const input =
    Array.isArray(value)
      ? value
      : [];

  if (
    input.length === 0
  ) {
    return [
      "COMPANY_CONTEXT",
      "CURRENT_DEVELOPMENTS",
      "SALES_RELEVANCE",
      "CONVERSATION_STARTERS",
      "DISCOVERY_QUESTIONS",
      "OBJECTION_PREPARATION",
      "RECOMMENDED_APPROACH"
    ];
  }

  const normalized = [];

  for (
    const item
    of input
  ) {
    const clean =
      cleanString(item);

    if (!clean) {
      continue;
    }

    const upper =
      clean
        .toUpperCase()
        .replace(/\s+/g, "_");

    if (
      !VALID_RESEARCH_SCOPES.has(
        upper
      )
    ) {
      throw new Error(
        `Unsupported research scope: ${upper}`
      );
    }

    if (
      !normalized.includes(
        upper
      )
    ) {
      normalized.push(
        upper
      );
    }
  }

  return normalized;
}

function buildProspectIntelligenceRequest({
  prospectKey,
  prospect = {},
  evidence = {},
  salesContext,
  icpProfileId = null,
  researchScopes = [],
  includeCurrentResearch = true
} = {}) {
  const cleanProspectKey =
    cleanString(
      prospectKey
    );

  if (!cleanProspectKey) {
    throw new Error(
      "prospectKey is required."
    );
  }

  const prospectName =
    cleanString(
      prospect.prospectName
    );

  if (!prospectName) {
    throw new Error(
      "prospect.prospectName is required."
    );
  }

  if (
    !salesContext ||
    typeof salesContext !==
      "object" ||
    Array.isArray(
      salesContext
    )
  ) {
    throw new Error(
      "salesContext is required."
    );
  }

  const normalizedSalesContext =
    buildSalesContext(
      salesContext
    );

  return {
    requestVersion:
      "1.0",

    prospectKey:
      cleanProspectKey,

    prospect: {
      prospectName,

      candidateName:
        cleanString(
          prospect.candidateName
        ),

      candidateDomain:
        cleanString(
          prospect.candidateDomain
        ),

      website:
        cleanString(
          prospect.website
        ),

      registrationId:
        cleanString(
          prospect.registrationId
        ),

      location:
        prospect.location &&
        typeof prospect.location ===
          "object"
          ? {
              city:
                cleanString(
                  prospect.location.city
                ),

              state:
                cleanString(
                  prospect.location.state
                )
            }
          : null
    },

    evidence: {
      rankingReasons:
        cleanArray(
          evidence.rankingReasons
        ),

      registryStatus:
        cleanString(
          evidence.registryStatus
        ),

      enrichmentStatus:
        cleanString(
          evidence.enrichmentStatus
        ),

      emails:
        cleanArray(
          evidence.emails
        ),

      phones:
        cleanArray(
          evidence.phones
        ),

      observations:
        cleanArray(
          evidence.observations
        )
    },

    salesContext:
      normalizedSalesContext,

    icpProfileId:
      cleanString(
        icpProfileId
      ),

    research: {
      includeCurrentResearch:
        includeCurrentResearch !==
          false,

      scopes:
        normalizeResearchScopes(
          researchScopes
        )
    }
  };
}

module.exports = {
  VALID_RESEARCH_SCOPES,
  buildProspectIntelligenceRequest,
  _test: {
    cleanString,
    cleanArray,
    normalizeResearchScopes
  }
};
