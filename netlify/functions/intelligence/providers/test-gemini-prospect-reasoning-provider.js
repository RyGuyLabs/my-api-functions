const assert =
  require("assert");

const {
  GeminiProspectReasoningProvider,
  RESPONSE_SCHEMA
} = require(
  "./GeminiProspectReasoningProvider.js"
);

function makeReasoningInput() {
  return {
    request: {
      prospectKey:
        "prospect_123",

      prospect: {
        prospectName:
          "Tampa Bay Solar",

        candidateDomain:
          "tampabaysolar.com"
      },

      evidence: {
        rankingReasons: [
          "Direct business candidate"
        ],

        registryStatus:
          "matched"
      },

      salesContext: {
        contextId:
          "commercial_insurance",

        offering: {
          name:
            "Commercial insurance review",

          valueProposition:
            "Review changing business exposures."
        }
      },

      research: {
        includeCurrentResearch:
          true,

        scopes: [
          "CURRENT_DEVELOPMENTS",
          "SALES_RELEVANCE"
        ]
      }
    },

    research: {
      searchedAt:
        "2026-09-01T16:30:00.000Z",

      results: [
        {
          intent:
            "CURRENT_DEVELOPMENTS",

          title:
            "Company Project Update",

          snippet:
            "A recent article describes a commercial project.",

          url:
            "https://example.com/update",

          sourceType:
            "public_web",

          sourceQuality:
            "STANDARD"
        },

        {
          intent:
            "COMPANY_OWNED",

          title:
            "Commercial Solar",

          snippet:
            "The company describes its commercial solar services.",

          url:
            "https://tampabaysolar.com/commercial",

          sourceType:
            "company_owned",

          sourceQuality:
            "FIRST_PARTY"
        }
      ],

      errors: []
    },

    epistemicRules: {
      factsMustRemainFacts:
        true,

      hypothesesMustRemainExplicit:
        true,

      firstPartyClaimsAreNotIndependentVerification:
        true,

      unsupportedClaimsAreForbidden:
        true
    }
  };
}

function makeAnalysis() {
  return {
    companyContext: {
      summary:
        "Public evidence describes commercial solar activity.",

      facts: [
        "A supplied source describes a recent commercial project."
      ]
    },

    currentDevelopments: [
      "A supplied public source describes a recent commercial project."
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
          "Changes in commercial work may have changed insurance exposure.",

        basis: [
          "Supplied evidence describes commercial project activity."
        ],

        confidence:
          "MEDIUM"
      }
    ],

    discoveryQuestions: [
      "Has your commercial project mix changed recently?"
    ],

    objectionPreparation: [
      "Do not assume the existing insurance program is inadequate."
    ],

    recommendedApproach:
      "Lead with a consultative risk review.",

    outreachIdea:
      "Reference the recent project and request a short conversation."
  };
}

(async () => {
  console.log(
    "1. provider requires reasoning input"
  );

  const provider =
    new GeminiProspectReasoningProvider({
      apiKey:
        "test-key",

      fetchImpl:
        async () => {
          throw new Error(
            "fetch should not run"
          );
        },

      maxRetries:
        0
    });

  assert.throws(
    () =>
      provider.buildPrompt(),
    /reasoningInput is required/
  );

  console.log(
    "2. prompt explicitly forbids invented evidence and browsing"
  );

  const prompt =
    provider.buildPrompt(
      makeReasoningInput()
    );

  assert.ok(
    prompt.includes(
      "Do not browse"
    )
  );

  assert.ok(
    prompt.includes(
      "Do not manufacture company facts"
    )
  );

  assert.ok(
    prompt.includes(
      "First-party company material"
    )
  );

  assert.ok(
    prompt.includes(
      "hypothesis"
    )
  );

  console.log(
    "3. Gemini request enforces structured JSON output"
  );

  const requestPayload =
    provider.buildRequestPayload(
      makeReasoningInput()
    );

  assert.strictEqual(
    requestPayload
      .generationConfig
      .responseMimeType,
    "application/json"
  );

  assert.strictEqual(
    requestPayload
      .generationConfig
      .responseSchema,
    RESPONSE_SCHEMA
  );

  console.log(
    "4. successful Gemini JSON is parsed into analysis"
  );

  let requestBody;

  const successProvider =
    new GeminiProspectReasoningProvider({
      apiKey:
        "test-key",

      maxRetries:
        0,

      fetchImpl:
        async (
          url,
          options
        ) => {
          requestBody =
            JSON.parse(
              options.body
            );

          return {
            ok:
              true,

            async json() {
              return {
                candidates: [
                  {
                    content: {
                      parts: [
                        {
                          text:
                            JSON.stringify(
                              makeAnalysis()
                            )
                        }
                      ]
                    }
                  }
                ]
              };
            }
          };
        }
    });

  const analysis =
    await successProvider
      .generateBriefAnalysis(
        makeReasoningInput()
      );

  assert.strictEqual(
    analysis
      .needHypotheses[0]
      .confidence,
    "MEDIUM"
  );

  assert.strictEqual(
    requestBody
      .generationConfig
      .responseMimeType,
    "application/json"
  );

  console.log(
    "5. non-transient client errors are not retried"
  );

  let clientErrorCalls =
    0;

  const clientErrorProvider =
    new GeminiProspectReasoningProvider({
      apiKey:
        "test-key",

      maxRetries:
        3,

      retryDelayMs:
        0,

      fetchImpl:
        async () => {
          clientErrorCalls += 1;

          return {
            ok:
              false,

            status:
              400,

            async text() {
              return "bad request";
            }
          };
        }
    });

  await assert.rejects(
    () =>
      clientErrorProvider
        .generateBriefAnalysis(
          makeReasoningInput()
        ),
    /HTTP 400/
  );

  assert.strictEqual(
    clientErrorCalls,
    1
  );

  console.log(
    "6. transient server errors can be retried"
  );

  let transientCalls =
    0;

  const retryProvider =
    new GeminiProspectReasoningProvider({
      apiKey:
        "test-key",

      maxRetries:
        1,

      retryDelayMs:
        0,

      fetchImpl:
        async () => {
          transientCalls += 1;

          if (
            transientCalls ===
            1
          ) {
            return {
              ok:
                false,

              status:
                503,

              async text() {
                return "temporary";
              }
            };
          }

          return {
            ok:
              true,

            async json() {
              return {
                candidates: [
                  {
                    content: {
                      parts: [
                        {
                          text:
                            JSON.stringify(
                              makeAnalysis()
                            )
                        }
                      ]
                    }
                  }
                ]
              };
            }
          };
        }
    });

  await retryProvider
    .generateBriefAnalysis(
      makeReasoningInput()
    );

  assert.strictEqual(
    transientCalls,
    2
  );

  console.log(
    "7. unsupported prospect-specific domain terms are rejected"
  );

  const unsupportedAnalysis =
    makeAnalysis();

  unsupportedAnalysis
    .salesRelevance = [
      "Battery systems may create electrical hazards."
    ];

  const unsupportedProvider =
    new GeminiProspectReasoningProvider({
      apiKey:
        "test-key",

      maxRetries:
        0,

      fetchImpl:
        async () => ({
          ok:
            true,

          async json() {
            return {
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        text:
                          JSON.stringify(
                            unsupportedAnalysis
                          )
                      }
                    ]
                  }
                }
              ]
            };
          }
        })
    });

  await assert.rejects(
    () =>
      unsupportedProvider
        .generateBriefAnalysis(
          makeReasoningInput()
        ),
    /unsupported domain terms: electrical hazards/
  );

  console.log(
    "8. supplied domain terms remain permitted"
  );

  const groundedInput =
    makeReasoningInput();

  groundedInput
    .research
    .results[0]
    .snippet =
      "The supplied source explicitly discusses electrical hazards.";

  const groundedAnalysis =
    makeAnalysis();

  groundedAnalysis
    .salesRelevance = [
      "The supplied evidence discusses electrical hazards, which may warrant further review."
    ];

  const groundedProvider =
    new GeminiProspectReasoningProvider({
      apiKey:
        "test-key",

      maxRetries:
        0,

      fetchImpl:
        async () => ({
          ok:
            true,

          async json() {
            return {
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        text:
                          JSON.stringify(
                            groundedAnalysis
                          )
                      }
                    ]
                  }
                }
              ]
            };
          }
        })
    });

  const groundedResult =
    await groundedProvider
      .generateBriefAnalysis(
        groundedInput
      );

  assert.ok(
    groundedResult
      .salesRelevance[0]
      .includes(
        "electrical hazards"
      )
  );

  console.log(
    "9. malformed Gemini JSON is rejected"
  );

  const malformedProvider =
    new GeminiProspectReasoningProvider({
      apiKey:
        "test-key",

      maxRetries:
        0,

      fetchImpl:
        async () => ({
          ok:
            true,

          async json() {
            return {
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        text:
                          "{not-json"
                      }
                    ]
                  }
                }
              ]
            };
          }
        })
    });

  await assert.rejects(
    () =>
      malformedProvider
        .generateBriefAnalysis(
          makeReasoningInput()
        ),
    /not valid JSON/
  );

  console.log(
    "10. guarded term explicitly present in research remains permitted"
  );

  const researchGroundedInput =
    makeReasoningInput();

  researchGroundedInput
    .research
    .results[0]
    .snippet =
      "The supplied research explicitly references property damage.";

  const researchGroundedAnalysis =
    makeAnalysis();

  researchGroundedAnalysis
    .salesRelevance = [
      "The supplied research references property damage, so the topic may warrant a discovery question."
    ];

  const researchGroundedProvider =
    new GeminiProspectReasoningProvider({
      apiKey:
        "test-key",

      maxRetries:
        0,

      fetchImpl:
        async () => ({
          ok:
            true,

          async json() {
            return {
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        text:
                          JSON.stringify(
                            researchGroundedAnalysis
                          )
                      }
                    ]
                  }
                }
              ]
            };
          }
        })
    });

  const researchGroundedResult =
    await researchGroundedProvider
      .generateBriefAnalysis(
        researchGroundedInput
      );

  assert.ok(
    researchGroundedResult
      .salesRelevance[0]
      .includes(
        "property damage"
      )
  );

  console.log(
    "11. guarded term present only in unrelated metadata is not treated as evidence"
  );

  const metadataOnlyInput =
    makeReasoningInput();

  metadataOnlyInput
    .epistemicRules = {
      internalExample:
        "property damage"
    };

  const metadataOnlyAnalysis =
    makeAnalysis();

  metadataOnlyAnalysis
    .salesRelevance = [
      "Property damage may be relevant to this prospect."
    ];

  const metadataOnlyProvider =
    new GeminiProspectReasoningProvider({
      apiKey:
        "test-key",

      maxRetries:
        0,

      fetchImpl:
        async () => ({
          ok:
            true,

          async json() {
            return {
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        text:
                          JSON.stringify(
                            metadataOnlyAnalysis
                          )
                      }
                    ]
                  }
                }
              ]
            };
          }
        })
    });

  await assert.rejects(
    () =>
      metadataOnlyProvider
        .generateBriefAnalysis(
          metadataOnlyInput
        ),

    /unsupported domain terms: property damage/
  );

  console.log(
    "12. prompt forbids extrapolated equipment systems and damage concepts"
  );

  const promptProvider =
    new GeminiProspectReasoningProvider({
      apiKey:
        "test-key"
    });

  const tightenedPrompt =
    promptProvider.buildPrompt(
      makeReasoningInput()
    );

  assert.ok(
    tightenedPrompt.includes(
      "Do not extrapolate equipment, systems, infrastructure, failure modes, damage types"
    )
  );

  assert.ok(
    tightenedPrompt.includes(
      "A named domain-specific concept may be used only when that concept is explicitly present"
    )
  );

  assert.ok(
    tightenedPrompt.includes(
      "Do not convert general industry knowledge into a prospect-specific named risk"
    )
  );

  console.log(
    "Gemini Prospect Reasoning Provider test PASSED."
  );
})().catch(error => {
  console.error(error);
  process.exit(1);
});
