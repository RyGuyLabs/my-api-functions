const assert =
  require("assert");

const {
  buildProspectIntelligenceRequest
} = require(
  "./ProspectIntelligenceRequest.js"
);

(() => {
  console.log(
    "1. prospect intelligence request requires a stable prospect"
  );

  assert.throws(
    () =>
      buildProspectIntelligenceRequest({
        salesContext: {
          offering:
            "Commercial Insurance"
        }
      }),
    /prospectKey is required/
  );

  console.log(
    "2. sales context is mandatory for relevant intelligence"
  );

  assert.throws(
    () =>
      buildProspectIntelligenceRequest({
        prospectKey:
          "prospect_123",

        prospect: {
          prospectName:
            "Tampa Bay Solar"
        }
      }),
    /salesContext is required/
  );

  console.log(
    "3. request combines prospect evidence with sales purpose"
  );

  const request =
    buildProspectIntelligenceRequest({
      prospectKey:
        "prospect_123",

      prospect: {
        prospectName:
          "Tampa Bay Solar",

        candidateDomain:
          "tampabaysolar.com",

        website:
          "https://tampabaysolar.com/",

        location: {
          city:
            "Tampa",

          state:
            "FL"
        }
      },

      evidence: {
        rankingReasons: [
          "Strong discovery evidence"
        ],

        registryStatus:
          "registry_matched",

        enrichmentStatus:
          "complete",

        emails: [
          {
            value:
              "info@tampabaysolar.com"
          }
        ]
      },

      salesContext: {
        contextId:
          "commercial_insurance_v1",

        offering:
          "Commercial Insurance",

        valueProposition:
          "Help growing businesses identify coverage gaps.",

        problemsSolved: [
          "Coverage gaps",
          "Risk visibility"
        ],

        targetRoles: [
          "Owner",
          "CFO"
        ],

        desiredOutcome:
          "Book a coverage review",

        preferredOutreachChannel:
          "phone"
      },

      icpProfileId:
        "fl_midmarket_v1",

      researchScopes: [
        "company context",
        "current developments",
        "sales relevance",
        "conversation starters"
      ],

      includeCurrentResearch:
        true
    });

  assert.strictEqual(
    request.requestVersion,
    "1.0"
  );

  assert.strictEqual(
    request.prospectKey,
    "prospect_123"
  );

  assert.strictEqual(
    request.salesContext
      .offering.name,
    "Commercial Insurance"
  );

  assert.strictEqual(
    request.salesContext
      .preferredOutreachChannel,
    "PHONE"
  );

  assert.strictEqual(
    request.icpProfileId,
    "fl_midmarket_v1"
  );

  assert.deepStrictEqual(
    request.research.scopes,
    [
      "COMPANY_CONTEXT",
      "CURRENT_DEVELOPMENTS",
      "SALES_RELEVANCE",
      "CONVERSATION_STARTERS"
    ]
  );

  assert.strictEqual(
    request.research
      .includeCurrentResearch,
    true
  );

  console.log(
    "4. default request includes useful sales-prep research without restricting search"
  );

  const defaults =
    buildProspectIntelligenceRequest({
      prospectKey:
        "prospect_456",

      prospect: {
        prospectName:
          "Example Manufacturer"
      },

      salesContext: {
        offering:
          "Cybersecurity"
      }
    });

  assert.ok(
    defaults.research.scopes
      .includes(
        "CURRENT_DEVELOPMENTS"
      )
  );

  assert.ok(
    defaults.research.scopes
      .includes(
        "SALES_RELEVANCE"
      )
  );

  assert.ok(
    defaults.research.scopes
      .includes(
        "CONVERSATION_STARTERS"
      )
  );

  console.log(
    "5. unsupported research scope is rejected"
  );

  assert.throws(
    () =>
      buildProspectIntelligenceRequest({
        prospectKey:
          "prospect_789",

        prospect: {
          prospectName:
            "Example Prospect"
        },

        salesContext: {
          offering:
            "Payroll Services"
        },

        researchScopes: [
          "MAKE_UP_PRIVATE_FINANCIALS"
        ]
      }),
    /Unsupported research scope/
  );

  console.log(
    "Prospect Intelligence Request test PASSED."
  );
})();
