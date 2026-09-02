const crypto =
  require("crypto");

const CONTRACT_VERSION =
  "1.0";

const SOURCE_APPLICATION =
  "prospect_intelligence";

const QUALIFICATION_STATUSES =
  new Set([
    "QUALIFIED",
    "NURTURE",
    "UNQUALIFIED"
  ]);

const CUSTOMER_PRIORITIES =
  new Set([
    "LOW",
    "MEDIUM",
    "HIGH",
    "CRITICAL"
  ]);

const REQUESTED_ACTIONS =
  new Set([
    "REQUEST_SALES_INTELLIGENCE",
    "CREATE_CUSTOMER_RECORD",
    "ADD_TO_FUNNEL",
    "CREATE_FOLLOW_UP_TASK"
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

function normalizeArray(
  value
) {
  return Array.isArray(value)
    ? value
    : [];
}

function normalizeIntelligenceBrief(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error(
      "intelligence.brief must be an object."
    );
  }

  const factualContext =
    value.factualContext &&
    typeof value.factualContext ===
      "object" &&
    !Array.isArray(
      value.factualContext
    )
      ? value.factualContext
      : {};

  const salesAnalysis =
    value.salesAnalysis &&
    typeof value.salesAnalysis ===
      "object" &&
    !Array.isArray(
      value.salesAnalysis
    )
      ? value.salesAnalysis
      : {};

  const sources =
    normalizeArray(
      value.sources
    );

  return {
    briefVersion:
      cleanString(
        value.briefVersion
      ),

    generatedAt:
      cleanString(
        value.generatedAt
      ),

    salesContextId:
      cleanString(
        value.salesContextId
      ),

    factualContext: {
      companySummary:
        cleanString(
          factualContext.companySummary
        ),

      companyFacts:
        normalizeArray(
          factualContext.companyFacts
        ),

      currentDevelopments:
        normalizeArray(
          factualContext.currentDevelopments
        ),

      conversationStarters:
        normalizeArray(
          factualContext.conversationStarters
        )
    },

    salesAnalysis: {
      salesRelevance:
        normalizeArray(
          salesAnalysis.salesRelevance
        ),

      needHypotheses:
        normalizeArray(
          salesAnalysis.needHypotheses
        ),

      discoveryQuestions:
        normalizeArray(
          salesAnalysis.discoveryQuestions
        ),

      objectionPreparation:
        normalizeArray(
          salesAnalysis.objectionPreparation
        ),

      recommendedApproach:
        cleanString(
          salesAnalysis.recommendedApproach
        ),

      outreachIdea:
        cleanString(
          salesAnalysis.outreachIdea
        )
    },

    sources
  };
}

function normalizeScore(
  value
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const score =
    Number(value);

  if (
    !Number.isFinite(score) ||
    score < 0 ||
    score > 100
  ) {
    throw new Error(
      "priorityScore must be between 0 and 100."
    );
  }

  return score;
}

function normalizeQualificationStatus(
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
    !QUALIFICATION_STATUSES.has(
      normalized
    )
  ) {
    throw new Error(
      "qualification.status is invalid."
    );
  }

  return normalized;
}

function normalizeCustomerPriority(
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
    !CUSTOMER_PRIORITIES.has(
      normalized
    )
  ) {
    throw new Error(
      "qualification.customerPriority is invalid."
    );
  }

  return normalized;
}

function normalizeRequestedActions(
  value
) {
  const actions =
    normalizeArray(value);

  const normalized = [];

  for (
    const action
    of actions
  ) {
    const clean =
      cleanString(action);

    if (!clean) {
      continue;
    }

    const upper =
      clean.toUpperCase();

    if (
      !REQUESTED_ACTIONS.has(
        upper
      )
    ) {
      throw new Error(
        `Unsupported handoff action: ${upper}`
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

function buildHandoffId({
  prospectKey,
  qualifiedByUserId,
  createdAt
}) {
  return (
    "handoff_" +
    crypto
      .createHash("sha256")
      .update(
        [
          prospectKey,
          qualifiedByUserId || "",
          createdAt
        ].join(":")
      )
      .digest("hex")
      .slice(0, 32)
  );
}

function buildProspectHandoff({
  prospectKey,
  prospect = {},
  contacts = {},
  qualification = {},
  intelligence = {},
  assignment = {},
  followUp = {},
  provenance = {},
  requestedActions = [],
  createdAt = null
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

  const timestamp =
    cleanString(createdAt) ||
    new Date().toISOString();

  const qualifiedByUserId =
    cleanString(
      assignment.qualifiedByUserId
    );

  const normalizedQualificationStatus =
    normalizeQualificationStatus(
      qualification.status
    );

  const normalizedCustomerPriority =
    normalizeCustomerPriority(
      qualification.customerPriority ||
      qualification.priority
    );

  const normalizedRequestedActions =
    normalizeRequestedActions(
      requestedActions
    );

  const handoffId =
    buildHandoffId({
      prospectKey:
        cleanProspectKey,
      qualifiedByUserId,
      createdAt:
        timestamp
    });

  return {
    contractVersion:
      CONTRACT_VERSION,

    handoffId,

    sourceApplication:
      SOURCE_APPLICATION,

    createdAt:
      timestamp,

    prospectKey:
      cleanProspectKey,

    requestedActions:
      normalizedRequestedActions,

    prospect: {
      prospectName:
        cleanString(
          prospect.prospectName
        ),

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

      jurisdiction:
        cleanString(
          prospect.jurisdiction
        ),

      registrationId:
        cleanString(
          prospect.registrationId
        ),

      address:
        prospect.address &&
        typeof prospect.address ===
          "object"
          ? {
              street:
                cleanString(
                  prospect.address.street
                ),

              city:
                cleanString(
                  prospect.address.city
                ),

              state:
                cleanString(
                  prospect.address.state
                ),

              zip:
                cleanString(
                  prospect.address.zip
                )
            }
          : null
    },

    contacts: {
      primaryContactName:
        cleanString(
          contacts.primaryContactName
        ),

      primaryContactRole:
        cleanString(
          contacts.primaryContactRole
        ),

      emails:
        normalizeArray(
          contacts.emails
        ),

      phones:
        normalizeArray(
          contacts.phones
        )
    },

    qualification: {
      status:
        normalizedQualificationStatus,

      customerPriority:
        normalizedCustomerPriority,

      estimatedValue:
        qualification.estimatedValue ===
          null ||
        qualification.estimatedValue ===
          undefined ||
        qualification.estimatedValue === ""
          ? null
          : Number(
              qualification.estimatedValue
            ),

      timing:
        cleanString(
          qualification.timing
        ),

      nextAction:
        cleanString(
          qualification.nextAction
        ),

      followUpDate:
        cleanString(
          qualification.followUpDate
        ),

      notes:
        cleanString(
          qualification.notes
        ),

      customAnswers:
        qualification.customAnswers &&
        typeof qualification.customAnswers ===
          "object" &&
        !Array.isArray(
          qualification.customAnswers
        )
          ? qualification.customAnswers
          : {}
    },

    intelligence: {
      priorityScore:
        normalizeScore(
          intelligence.priorityScore
        ),

      rankingReasons:
        normalizeArray(
          intelligence.rankingReasons
        ),

      registryStatus:
        cleanString(
          intelligence.registryStatus
        ),

      enrichmentStatus:
        cleanString(
          intelligence.enrichmentStatus
        ),

      brief:
        normalizeIntelligenceBrief(
          intelligence.brief
        )
    },

    assignment: {
      qualifiedByUserId,

      assignedAgentId:
        cleanString(
          assignment.assignedAgentId
        ),

      tenantId:
        cleanString(
          assignment.tenantId
        )
    },

    followUp: {
      date:
        cleanString(
          followUp.date ||
          qualification.followUpDate
        ),

      action:
        cleanString(
          followUp.action ||
          qualification.nextAction
        ),

      assignedAgentId:
        cleanString(
          followUp.assignedAgentId ||
          assignment.assignedAgentId
        )
    },

    provenance: {
      sourceQuery:
        provenance.sourceQuery &&
        typeof provenance.sourceQuery ===
          "object"
          ? provenance.sourceQuery
          : null,

      discoveredAt:
        cleanString(
          provenance.discoveredAt
        ),

      enrichedAt:
        cleanString(
          provenance.enrichedAt
        )
    }
  };
}

module.exports = {
  CONTRACT_VERSION,
  SOURCE_APPLICATION,
  QUALIFICATION_STATUSES,
  CUSTOMER_PRIORITIES,
  REQUESTED_ACTIONS,
  buildProspectHandoff,
  buildHandoffId,
  _test: {
    cleanString,
    normalizeScore,
    normalizeIntelligenceBrief,
    normalizeQualificationStatus,
    normalizeCustomerPriority,
    normalizeRequestedActions
  }
};
