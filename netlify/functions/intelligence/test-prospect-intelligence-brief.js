const assert =
  require("assert");

const {
  buildProspectIntelligenceBrief
} = require(
  "./ProspectIntelligenceBrief.js"
);

(() => {
  console.log(
    "1. intelligence brief requires a prospect key"
  );

  assert.throws(
    () =>
      buildProspectIntelligenceBrief({}),
    /prospectKey is required/
  );

  console.log(
    "2. factual context remains separate from sales analysis"
  );

  const brief =
    buildProspectIntelligenceBrief({
      prospectKey:
        "prospect_123",

      generatedAt:
        "2026-09-01T14:00:00.000Z",

      salesContextId:
        "commercial_insurance_v1",

      companyContext: {
        summary:
          "Tampa Bay Solar is a regional solar contractor.",

        facts: [
          "Operates in the Tampa market",
          "Maintains a public business website"
        ]
      },

      currentDevelopments: [
        "The company recently highlighted a local project."
      ],

      conversationStarters: [
        "Mention the company's recent local project."
      ],

      salesRelevance: [
        "Recent growth may justify reviewing changing business exposures."
      ],

      needHypotheses: [
        {
          statement:
            "Growth may have changed insurance exposure.",

          basis: [
            "Recent expansion activity"
          ],

          confidence:
            "medium"
        }
      ],

      discoveryQuestions: [
        "Has your coverage structure changed as the business has grown?"
      ],

      objectionPreparation: [
        "Do not assume the current insurance program is inadequate."
      ],

      recommendedApproach:
        "Lead with a consultative risk review.",

      outreachIdea:
        "Reference the recent company development before requesting a brief review.",

      sources: [
        {
          title:
            "Example Company Update",

          url:
            "https://example.com/news",

          publisher:
            "Example Publisher",

          publishedAt:
            "2026-08-28",

          observedAt:
            "2026-09-01T14:00:00.000Z",

          summary:
            "Company announced a recent local project."
        }
      ]
    });

  assert.strictEqual(
    brief.briefVersion,
    "1.0"
  );

  assert.strictEqual(
    brief.prospectKey,
    "prospect_123"
  );

  assert.strictEqual(
    brief.factualContext
      .companyFacts.length,
    2
  );

  assert.strictEqual(
    brief.salesAnalysis
      .needHypotheses[0]
      .confidence,
    "MEDIUM"
  );

  assert.strictEqual(
    brief.sources[0].url,
    "https://example.com/news"
  );

  console.log(
    "3. source URL is mandatory for sourced current claims"
  );

  assert.throws(
    () =>
      buildProspectIntelligenceBrief({
        prospectKey:
          "prospect_456",

        sources: [
          {
            title:
              "Missing URL"
          }
        ]
      }),
    /source.url is required/
  );

  console.log(
    "4. hypotheses are explicitly distinguishable from facts"
  );

  const hypothesisBrief =
    buildProspectIntelligenceBrief({
      prospectKey:
        "prospect_789",

      companyContext: {
        facts: [
          "Company lists multiple locations."
        ]
      },

      needHypotheses: [
        {
          statement:
            "Multiple locations may create coordination complexity.",

          basis: [
            "Company lists multiple locations."
          ],

          confidence:
            "HIGH"
        }
      ]
    });

  assert.deepStrictEqual(
    hypothesisBrief
      .factualContext
      .companyFacts,
    [
      "Company lists multiple locations."
    ]
  );

  assert.strictEqual(
    hypothesisBrief
      .salesAnalysis
      .needHypotheses[0]
      .statement,
    "Multiple locations may create coordination complexity."
  );

  console.log(
    "5. invalid hypothesis confidence is rejected"
  );

  assert.throws(
    () =>
      buildProspectIntelligenceBrief({
        prospectKey:
          "prospect_999",

        needHypotheses: [
          {
            statement:
              "Possible need.",

            confidence:
              "CERTAIN"
          }
        ]
      }),
    /confidence is invalid/
  );

  console.log(
    "Prospect Intelligence Brief test PASSED."
  );
})();
