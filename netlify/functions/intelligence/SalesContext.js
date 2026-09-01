const VALID_OUTREACH_CHANNELS =
  new Set([
    "PHONE",
    "EMAIL",
    "LINKEDIN",
    "IN_PERSON",
    "SMS",
    "OTHER"
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

function cleanStringArray(
  value
) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value
        .map(cleanString)
        .filter(Boolean)
    )
  ];
}

function normalizeOutreachChannel(
  value
) {
  const clean =
    cleanString(value);

  if (!clean) {
    return null;
  }

  const normalized =
    clean
      .toUpperCase()
      .replace(/\s+/g, "_");

  if (
    !VALID_OUTREACH_CHANNELS.has(
      normalized
    )
  ) {
    throw new Error(
      "preferredOutreachChannel is invalid."
    );
  }

  return normalized;
}

function buildSalesContext({
  contextId = null,
  contextName = null,
  sellerCompany = null,
  sellerName = null,
  sellerRole = null,
  offering,
  offeringDescription = null,
  valueProposition = null,
  problemsSolved = [],
  differentiators = [],
  targetRoles = [],
  desiredOutcome = null,
  preferredOutreachChannel = null,
  talkingPoints = [],
  constraints = [],
  additionalContext = null
} = {}) {
  const cleanOffering =
    cleanString(
      offering
    );

  if (!cleanOffering) {
    throw new Error(
      "offering is required."
    );
  }

  return {
    contextId:
      cleanString(
        contextId
      ),

    contextName:
      cleanString(
        contextName
      ),

    seller: {
      company:
        cleanString(
          sellerCompany
        ),

      name:
        cleanString(
          sellerName
        ),

      role:
        cleanString(
          sellerRole
        )
    },

    offering: {
      name:
        cleanOffering,

      description:
        cleanString(
          offeringDescription
        ),

      valueProposition:
        cleanString(
          valueProposition
        ),

      problemsSolved:
        cleanStringArray(
          problemsSolved
        ),

      differentiators:
        cleanStringArray(
          differentiators
        )
    },

    targetRoles:
      cleanStringArray(
        targetRoles
      ),

    desiredOutcome:
      cleanString(
        desiredOutcome
      ),

    preferredOutreachChannel:
      normalizeOutreachChannel(
        preferredOutreachChannel
      ),

    talkingPoints:
      cleanStringArray(
        talkingPoints
      ),

    constraints:
      cleanStringArray(
        constraints
      ),

    additionalContext:
      cleanString(
        additionalContext
      )
  };
}

module.exports = {
  VALID_OUTREACH_CHANNELS,
  buildSalesContext,
  _test: {
    cleanString,
    cleanStringArray,
    normalizeOutreachChannel
  }
};
