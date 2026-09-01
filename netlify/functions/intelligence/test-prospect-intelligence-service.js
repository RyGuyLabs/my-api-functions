const assert =
  require("assert");

const {
  ProspectIntelligenceService
} = require(
  "./ProspectIntelligenceService.js"
);

(async () => {
  console.log(
    "1. service requires research and reasoning dependencies"
  );

  assert.throws(
    () =>
      new ProspectIntelligenceService(),
    /requires a research provider/
  );

  assert.throws(
    () =>
      new ProspectIntelligenceService({
        researchProvider: {
          research:
            async () => ({})
        }
      }),
    /requires a reasoning provider/
  );

  console.log(
    "2. service researches the known prospect before reasoning"
  );

  const calls = [];

  const researchProvider = {
    async research(
      input
    ) {
      calls.push({
        type:
          "research",
        input
      });

      return {
        searchedAt:
          "2026-09-01T16:00:00.000Z",

        results: [
          {
            intent:
              "CURRENT_DEVELOPMENTS",

            title:
              "Example Independent Update",

            snippet:
              "The company announced a new commercial project.",

            url:
              "https://example.com/company-update",

            domain:
              "example.com",

            sourceType:
              "public_web",

            sourceQuality:
              "STANDARD"
          },

          {
            intent:
              "COMPANY_OWNED",

            title:
              "Company Services",

            snippet:
              "The company describes commercial solar services.",

            url:
              "https://tampabaysolar.com/commercial",

            domain:
              "tampabaysolar.com",

            sourceType:
              "company_owned",

            sourceQuality:
              "FIRST_PARTY"
          }
        ],

        errors: []
      };
    }
  };

  const reasoningProvider = {
    async generateBriefAnalysis(
      input
    ) {
      calls.push({
        type:
          "reasoning",
        input
      });

      assert.strictEqual(
        input
          .epistemicRules
          .factsMustRemainFacts,
        true
      );

      assert.strictEqual(
        input
          .epistemicRules
          .hypothesesMustRemainExplicit,
        true
      );

      assert.strictEqual(
        input
          .epistemicRules
          .firstPartyClaimsAreNotIndependentVerification,
        true
      );

      return {
        companyContext: {
          summary:
            "Tampa Bay Solar is a Florida solar contractor.",

          facts: [
            "Public sources describe commercial solar activity."
          ]
        },

        currentDevelopments: [
          "A recent public source describes a commercial project."
        ],

        conversationStarters: [
          "Ask about the recent commercial project."
        ],

        salesRelevance: [
          "Commercial project activity may make a risk review timely."
        ],

        needHypotheses: [
          {
            statement:
              "Growth in commercial work may have changed insurance exposure.",

            basis: [
              "Recent commercial project activity"
            ],

            confidence:
              "MEDIUM"
          }
        ],

        discoveryQuestions: [
          "Has your commercial project mix changed recently?"
        ],

        objectionPreparation: [
          "Do not assume existing coverage is inadequate."
        ],

        recommendedApproach:
          "Use a consultative risk-review approach.",

        outreachIdea:
          "Reference the recent commercial project and request a short risk review."
      };
    }
  };

  const service =
    new ProspectIntelligenceService({
      researchProvider,
      reasoningProvider,

      clock:
        () =>
          new Date(
            "2026-09-01T16:05:00.000Z"
          )
    });

  const brief =
    await service.buildBrief({
      prospectKey:
        "prospect_tampa_bay_solar",

      prospect: {
        prospectName:
          "Tampa Bay Solar",

        candidateDomain:
          "tampabaysolar.com",

        website:
          "https://tampabaysolar.com",

        location: {
          city:
            "Tampa",

          state:
            "FL"
        }
      },

      evidence: {
        rankingReasons: [
          "Direct business candidate"
        ],

        registryStatus:
          "matched",

        enrichmentStatus:
          "enriched"
      },

      salesContext: {
        contextId:
          "commercial_insurance_v1",

        contextName:
          "Commercial Insurance",

        sellerCompany:
          "Example Agency",

        sellerName:
          "Agent Example",

        offering:
          "Commercial insurance review",

        valueProposition:
          "Identify coverage gaps as the business changes.",

        problemsSolved: [
          "Changing operational exposures"
        ],

        targetRoles: [
          "Owner",
          "CFO"
        ],

        preferredOutreachChannel:
          "phone"
      }
    });

  assert.strictEqual(
    calls[0].type,
    "research"
  );

  assert.strictEqual(
    calls[1].type,
    "reasoning"
  );

  assert.strictEqual(
    calls[0]
      .input
      .prospectName,
    "Tampa Bay Solar"
  );

  console.log(
    "3. service preserves source provenance in the final brief"
  );

  assert.strictEqual(
    brief.sources.length,
    2
  );

  assert.strictEqual(
    brief.sources[1]
      .sourceType,
    "company_owned"
  );

  assert.strictEqual(
    brief.sources[1]
      .sourceQuality,
    "FIRST_PARTY"
  );

  console.log(
    "4. hypotheses remain structurally separate from factual context"
  );

  assert.strictEqual(
    brief
      .salesAnalysis
      .needHypotheses[0]
      .statement,
    "Growth in commercial work may have changed insurance exposure."
  );

  assert.ok(
    !brief
      .factualContext
      .companyFacts
      .includes(
        "Growth in commercial work may have changed insurance exposure."
      )
  );

  console.log(
    "5. current research can be disabled without skipping reasoning"
  );

  let disabledResearchCalled =
    false;

  const disabledService =
    new ProspectIntelligenceService({
      researchProvider: {
        async research() {
          disabledResearchCalled =
            true;

          return {
            results: []
          };
        }
      },

      reasoningProvider: {
        async generateBriefAnalysis(
          input
        ) {
          assert.strictEqual(
            input
              .research
              .results
              .length,
            0
          );

          return {
            companyContext: {
              facts: [
                "Existing prospect evidence remains available."
              ]
            }
          };
        }
      },

      clock:
        () =>
          new Date(
            "2026-09-01T16:10:00.000Z"
          )
    });

  await disabledService.buildBrief({
    prospectKey:
      "prospect_no_research",

    prospect: {
      prospectName:
        "Example Prospect"
    },

    salesContext: {
      offering:
        "Payroll services"
    },

    includeCurrentResearch:
      false
  });

  assert.strictEqual(
    disabledResearchCalled,
    false
  );

  console.log(
    "Prospect Intelligence Service test PASSED."
  );
})().catch(error => {
  console.error(error);
  process.exit(1);
});
