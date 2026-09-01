const VALID_CONFIDENCE_LEVELS =
  new Set([
    "LOW",
    "MEDIUM",
    "HIGH"
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

  return value
    .map(cleanString)
    .filter(Boolean);
}

function normalizeConfidence(
  value
) {
  const clean =
    cleanString(value);

  if (!clean) {
    return null;
  }

  const normalized =
    clean.toUpperCase();

  if (
    !VALID_CONFIDENCE_LEVELS.has(
      normalized
    )
  ) {
    throw new Error(
      "confidence is invalid."
    );
  }

  return normalized;
}

function normalizeSource(
  source
) {
  if (
    !source ||
    typeof source !== "object" ||
    Array.isArray(source)
  ) {
    throw new Error(
      "Each source must be an object."
    );
  }

  const url =
    cleanString(
      source.url
    );

  if (!url) {
    throw new Error(
      "source.url is required."
    );
  }

  return {
    title:
      cleanString(
        source.title
      ),

    url,

    publisher:
      cleanString(
        source.publisher
      ),

    publishedAt:
      cleanString(
        source.publishedAt
      ),

    observedAt:
      cleanString(
        source.observedAt
      ),

    summary:
      cleanString(
        source.summary
      )
  };
}

function normalizeSources(
  value
) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(
    normalizeSource
  );
}

function normalizeHypothesis(
  item
) {
  if (
    typeof item === "string"
  ) {
    return {
      statement:
        cleanString(item),

      basis:
        [],

      confidence:
        null
    };
  }

  if (
    !item ||
    typeof item !==
      "object" ||
    Array.isArray(item)
  ) {
    throw new Error(
      "Each hypothesis must be a string or object."
    );
  }

  const statement =
    cleanString(
      item.statement
    );

  if (!statement) {
    throw new Error(
      "hypothesis.statement is required."
    );
  }

  return {
    statement,

    basis:
      cleanStringArray(
        item.basis
      ),

    confidence:
      normalizeConfidence(
        item.confidence
      )
  };
}

function normalizeHypotheses(
  value
) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(
    normalizeHypothesis
  );
}

function buildProspectIntelligenceBrief({
  prospectKey,
  generatedAt = null,
  salesContextId = null,
  companyContext = {},
  currentDevelopments = [],
  conversationStarters = [],
  salesRelevance = [],
  needHypotheses = [],
  discoveryQuestions = [],
  objectionPreparation = [],
  recommendedApproach = null,
  outreachIdea = null,
  sources = []
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

  return {
    briefVersion:
      "1.0",

    prospectKey:
      cleanProspectKey,

    generatedAt:
      cleanString(
        generatedAt
      ) ||
      new Date().toISOString(),

    salesContextId:
      cleanString(
        salesContextId
      ),

    factualContext: {
      companySummary:
        cleanString(
          companyContext.summary
        ),

      companyFacts:
        cleanStringArray(
          companyContext.facts
        ),

      currentDevelopments:
        cleanStringArray(
          currentDevelopments
        ),

      conversationStarters:
        cleanStringArray(
          conversationStarters
        )
    },

    salesAnalysis: {
      salesRelevance:
        cleanStringArray(
          salesRelevance
        ),

      needHypotheses:
        normalizeHypotheses(
          needHypotheses
        ),

      discoveryQuestions:
        cleanStringArray(
          discoveryQuestions
        ),

      objectionPreparation:
        cleanStringArray(
          objectionPreparation
        ),

      recommendedApproach:
        cleanString(
          recommendedApproach
        ),

      outreachIdea:
        cleanString(
          outreachIdea
        )
    },

    sources:
      normalizeSources(
        sources
      )
  };
}

module.exports = {
  VALID_CONFIDENCE_LEVELS,
  buildProspectIntelligenceBrief,
  _test: {
    cleanString,
    cleanStringArray,
    normalizeConfidence,
    normalizeSource,
    normalizeSources,
    normalizeHypothesis,
    normalizeHypotheses
  }
};
