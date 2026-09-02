const DEFAULT_MODEL =
  "gemini-2.5-flash";

const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

const GUARDED_DOMAIN_TERMS = [
  "property damage",
  "property insurance",
  "liability insurance",
  "professional liability",
  "product liability",
  "business interruption",
  "workers compensation",
  "workers' compensation",
  "cyber",
  "fire hazard",
  "fire hazards",
  "chemical hazard",
  "chemical hazards",
  "electrical hazard",
  "electrical hazards",
  "electrical systems",
  "performance guarantee",
  "performance guarantees"
];

const RESPONSE_SCHEMA = {
  type: "OBJECT",

  properties: {
    companyContext: {
      type: "OBJECT",

      properties: {
        summary: {
          type: "STRING"
        },

        facts: {
          type: "ARRAY",

          items: {
            type: "STRING"
          }
        }
      },

      required: [
        "summary",
        "facts"
      ]
    },

    currentDevelopments: {
      type: "ARRAY",

      items: {
        type: "STRING"
      }
    },

    conversationStarters: {
      type: "ARRAY",

      items: {
        type: "STRING"
      }
    },

    salesRelevance: {
      type: "ARRAY",

      items: {
        type: "STRING"
      }
    },

    needHypotheses: {
      type: "ARRAY",

      items: {
        type: "OBJECT",

        properties: {
          statement: {
            type: "STRING"
          },

          basis: {
            type: "ARRAY",

            items: {
              type: "STRING"
            }
          },

          confidence: {
            type: "STRING",

            enum: [
              "LOW",
              "MEDIUM",
              "HIGH"
            ]
          }
        },

        required: [
          "statement",
          "basis",
          "confidence"
        ]
      }
    },

    discoveryQuestions: {
      type: "ARRAY",

      items: {
        type: "STRING"
      }
    },

    objectionPreparation: {
      type: "ARRAY",

      items: {
        type: "STRING"
      }
    },

    recommendedApproach: {
      type: "STRING"
    },

    outreachIdea: {
      type: "STRING"
    }
  },

  required: [
    "companyContext",
    "currentDevelopments",
    "conversationStarters",
    "salesRelevance",
    "needHypotheses",
    "discoveryQuestions",
    "objectionPreparation",
    "recommendedApproach",
    "outreachIdea"
  ]
};

function sleep(
  milliseconds
) {
  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        milliseconds
      )
  );
}

function normalizeGroundingText(
  value
) {
  return JSON.stringify(
    value || {}
  )
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildGroundingEvidenceCorpus(
  reasoningInput
) {
  const request =
    reasoningInput &&
    typeof reasoningInput ===
      "object"
      ? reasoningInput.request
      : null;

  const research =
    reasoningInput &&
    typeof reasoningInput ===
      "object"
      ? reasoningInput.research
      : null;

  return normalizeGroundingText({
    prospect:
      request?.prospect ||
      null,

    evidence:
      request?.evidence ||
      null,

    salesContext:
      request?.salesContext ||
      null,

    researchResults:
      Array.isArray(
        research?.results
      )
        ? research.results
        : []
  });
}

function assertGroundedDomainTerms(
  reasoningInput,
  analysis
) {
  const supplied =
    buildGroundingEvidenceCorpus(
      reasoningInput
    );

  const generated =
    normalizeGroundingText(
      analysis
    );

  const matchedTerms =
    GUARDED_DOMAIN_TERMS
      .filter(
        term => {
          const normalizedTerm =
            normalizeGroundingText(
              term
            );

          return (
            generated.includes(
              normalizedTerm
            ) &&
            !supplied.includes(
              normalizedTerm
            )
          );
        }
      )
      .sort(
        (a, b) =>
          b.length -
          a.length
      );

  const violations =
    matchedTerms.filter(
      (term, index) => {
        const normalizedTerm =
          normalizeGroundingText(
            term
          );

        return !matchedTerms
          .slice(
            0,
            index
          )
          .some(
            longerTerm =>
              normalizeGroundingText(
                longerTerm
              ).includes(
                normalizedTerm
              )
          );
      }
    );

  if (
    violations.length >
      0
  ) {
    throw new Error(
      `Gemini reasoning introduced unsupported domain terms: ${violations.join(", ")}`
    );
  }

  return analysis;
}

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

class GeminiProspectReasoningProvider {
  constructor({
    apiKey = null,
    model =
      DEFAULT_MODEL,
    fetchImpl =
      global.fetch,
    maxRetries = 2,
    retryDelayMs = 250,
    requestTimeoutMs =
      5000
  } = {}) {
    this.apiKey =
      cleanString(
        apiKey
      );

    this.model =
      cleanString(
        model
      ) ||
      DEFAULT_MODEL;

    if (
      typeof fetchImpl !==
        "function"
    ) {
      throw new Error(
        "GeminiProspectReasoningProvider requires fetch."
      );
    }

    this.fetchImpl =
      fetchImpl;

    this.maxRetries =
      Math.max(
        0,
        Math.min(
          Number(
            maxRetries
          ) || 0,
          3
        )
      );

    this.retryDelayMs =
      Math.max(
        0,
        Number(
          retryDelayMs
        ) || 0
      );

    this.requestTimeoutMs =
      Math.max(
        500,
        Number(
          requestTimeoutMs
        ) || 5000
      );
  }

  resolveApiKey() {
    const apiKey =
      this.apiKey ||
      cleanString(
        process.env
          .PROSPECT_INTELLIGENCE_API_KEY
      );

    if (!apiKey) {
      throw new Error(
        "Gemini API key is unavailable."
      );
    }

    return apiKey;
  }

  buildPrompt(
    reasoningInput
  ) {
    if (
      !reasoningInput ||
      typeof reasoningInput !==
        "object" ||
      Array.isArray(
        reasoningInput
      )
    ) {
      throw new Error(
        "reasoningInput is required."
      );
    }

    const request =
      reasoningInput.request;

    if (
      !request ||
      typeof request !==
        "object"
    ) {
      throw new Error(
        "reasoningInput.request is required."
      );
    }

    const research =
      reasoningInput.research &&
      typeof reasoningInput.research ===
        "object"
        ? reasoningInput.research
        : {
            results: [],
            errors: []
          };

    const epistemicRules =
      reasoningInput.epistemicRules &&
      typeof reasoningInput.epistemicRules ===
        "object"
        ? reasoningInput.epistemicRules
        : {};

    const payload = {
      prospect:
        request.prospect,

      knownEvidence:
        request.evidence,

      salesContext:
        request.salesContext,

      requestedResearch:
        request.research,

      research: {
        searchedAt:
          research.searchedAt ||
          null,

        results:
          Array.isArray(
            research.results
          )
            ? research.results
            : [],

        errors:
          Array.isArray(
            research.errors
          )
            ? research.errors
            : []
      },

      epistemicRules
    };

    return [
      "Analyze the supplied prospect for sales preparation.",
      "",
      "STRICT EPISTEMIC RULES:",
      "- Use only the prospect evidence and research supplied in this request.",
      "- Do not browse, imply browsing, or invent additional sources.",
      "- Do not manufacture company facts, financials, headcount, needs, budgets, relationships, or internal conditions.",
      "- First-party company material may describe the company's own claims or positioning, but is not independent verification.",
      "- When a factual statement comes only from a source marked company_owned or FIRST_PARTY, explicitly attribute it with wording such as 'the company's website says', 'the company states', or 'the company describes'.",
      "- Do not rewrite a first-party claim as an independently verified fact.",
      "- Keep observable facts separate from sales hypotheses.",
      "- Any possible business need must appear only as a hypothesis and use cautious language such as may, might, could, or consider asking.",
      "- A hypothesis must include its supporting basis.",
      "- Do not assign HIGH confidence to a need hypothesis supported only by first-party company material. First-party-only support should normally be LOW or MEDIUM unless independent supplied evidence materially corroborates the inference.",
      "- Do not state that a prospect has a problem unless the supplied evidence explicitly establishes it.",
      "- Current developments must be grounded in supplied research results.",
      "- If evidence is insufficient, return fewer claims rather than filling gaps.",
      "",
      "SALES PREPARATION RULES:",
      "- Interpret relevance through the supplied Sales Context.",
      "- Do not alter or restrict prospect discovery criteria.",
      "- Create practical discovery questions rather than pretending unknown answers are known.",
      "- Conversation starters should help the seller sound informed without overstating certainty.",
      "- Sales relevance is analysis, not fact. When connecting observed company activity to possible risk, need, exposure, opportunity, or insurance implications, use cautious language such as may, might, could, or may warrant asking.",
      "- Do not state that an offering, activity, technology, policy change, or business development creates a specific risk or need unless the supplied evidence explicitly establishes that fact.",
      "- Do not introduce prospect-specific risk categories, hazards, liabilities, insurance coverages, regulatory problems, operational problems, technical failure modes, equipment names, system names, or technical capabilities that are not explicitly present in the supplied evidence.",
      "- Do not extrapolate equipment, systems, infrastructure, failure modes, damage types, insurance exposures, regulatory exposures, or technical capabilities from the prospect's industry or activities.",
      "- A named domain-specific concept may be used only when that concept is explicitly present in the supplied prospect evidence, Sales Context, or research results.",
      "- Do not convert general industry knowledge into a prospect-specific named risk, hazard, coverage, system, exposure, or damage category.",
      "- General domain knowledge may inform the structure of a discovery question, but it must not supply a named prospect-specific concept that is absent from the evidence.",
      "- If a specific concept is not explicitly supported, use generic language such as 'operational considerations', 'areas worth reviewing', 'risk profile', 'coverage considerations', or 'business exposures'.",
      "- If the evidence only shows that the prospect performs an activity, say that the activity may warrant asking about related exposures rather than naming unsupplied exposures as facts.",
      "- In salesRelevance and needHypotheses, do not introduce a named insurance coverage, named liability category, named hazard, named technical failure mode, or named regulatory exposure unless that exact concept already appears in the supplied prospect evidence, research, or Sales Context.",
      "- When a specific risk or coverage category is not supplied, use generic language only: 'operational exposures', 'coverage considerations', 'risk profile', 'insurance needs', or 'areas worth reviewing'.",
      "- Examples of terms that must NOT be introduced from general knowledge alone include property damage, property insurance, liability insurance, professional liability, product liability, business interruption, workers compensation, cyber, fire hazard, chemical hazard, electrical hazard, performance guarantees, and regulatory liability.",
      "- Discovery questions must also avoid presuming an unsupplied risk exists. Ask what considerations or exposures the prospect evaluates rather than asserting that a particular hazard exists.",
      "- Objection preparation should avoid assuming an objection was actually raised.",
      "- recommendedApproach and outreachIdea should be concise and actionable.",
      "",
      "Return only JSON matching the required schema.",
      "",
      "INPUT:",
      JSON.stringify(
        payload,
        null,
        2
      )
    ].join("\n");
  }

  buildRequestPayload(
    reasoningInput
  ) {
    return {
      contents: [
        {
          parts: [
            {
              text:
                this.buildPrompt(
                  reasoningInput
                )
            }
          ]
        }
      ],

      generationConfig: {
        responseMimeType:
          "application/json",

        responseSchema:
          RESPONSE_SCHEMA,

        temperature:
          0.2,

        maxOutputTokens:
          3000,

        thinkingConfig: {
          thinkingBudget:
            0
        }
      },

      systemInstruction: {
        parts: [
          {
            text:
              "You are a sales intelligence reasoning engine. You interpret supplied evidence for sales preparation. You never invent evidence, never perform research, always distinguish facts from hypotheses, and explicitly attribute first-party company claims rather than presenting them as independently verified facts."
          }
        ]
      }
    };
  }

  shouldRetry(
    status
  ) {
    return (
      status === 408 ||
      status === 429 ||
      status >= 500
    );
  }

  async requestGemini(
    payload
  ) {
    const apiKey =
      this.resolveApiKey();

    const url =
      `${GEMINI_API_BASE}/${encodeURIComponent(this.model)}:generateContent` +
      `?key=${encodeURIComponent(apiKey)}`;

    let lastError;

    for (
      let attempt = 0;
      attempt <=
        this.maxRetries;
      attempt += 1
    ) {
      const controller =
        new AbortController();

      const timeout =
        setTimeout(
          () =>
            controller.abort(),
          this.requestTimeoutMs
        );

      try {
        const response =
          await this
            .fetchImpl(
              url,
              {
                method:
                  "POST",

                headers: {
                  "Content-Type":
                    "application/json"
                },

                body:
                  JSON.stringify(
                    payload
                  ),

                signal:
                  controller.signal
              }
            );

        if (!response.ok) {
          const body =
            await response
              .text()
              .catch(
                () => ""
              );

          const error =
            new Error(
              `Gemini reasoning request failed with HTTP ${response.status}.`
            );

          error.status =
            response.status;

          error.responseBody =
            body;

          if (
            !this.shouldRetry(
              response.status
            ) ||
            attempt ===
              this.maxRetries
          ) {
            throw error;
          }

          lastError =
            error;

        } else {
          return await response.json();
        }

      } catch (error) {
        if (
          error?.name ===
            "AbortError"
        ) {
          const timeoutError =
            new Error(
              "Gemini reasoning request timed out."
            );

          timeoutError.code =
            "GEMINI_TIMEOUT";

          throw timeoutError;
        }

        if (
          error?.status &&
          !this.shouldRetry(
            error.status
          )
        ) {
          throw error;
        }

        lastError =
          error;

        if (
          attempt ===
            this.maxRetries
        ) {
          throw error;
        }
      } finally {
        clearTimeout(
          timeout
        );
      }

      if (
        this.retryDelayMs >
          0
      ) {
        await sleep(
          this.retryDelayMs *
          Math.pow(
            2,
            attempt
          )
        );
      }
    }

    throw (
      lastError ||
      new Error(
        "Gemini reasoning request failed."
      )
    );
  }

  parseResponse(
    payload
  ) {
    const candidate =
      payload
        ?.candidates
        ?.[0];

    const text =
      candidate
        ?.content
        ?.parts
        ?.[0]
        ?.text;

    if (
      !cleanString(
        text
      )
    ) {
      throw new Error(
        "Gemini reasoning response contained no JSON text."
      );
    }

    let parsed;

    try {
      parsed =
        JSON.parse(
          text
        );

    } catch {
      throw new Error(
        "Gemini reasoning response was not valid JSON."
      );
    }

    if (
      !parsed ||
      typeof parsed !==
        "object" ||
      Array.isArray(parsed)
    ) {
      throw new Error(
        "Gemini reasoning response was not an object."
      );
    }

    return parsed;
  }

  async generateBriefAnalysis(
    reasoningInput
  ) {
    const payload =
      this.buildRequestPayload(
        reasoningInput
      );

    const response =
      await this.requestGemini(
        payload
      );

    const analysis =
      this.parseResponse(
        response
      );

    return assertGroundedDomainTerms(
      reasoningInput,
      analysis
    );
  }
}

module.exports = {
  DEFAULT_MODEL,
  RESPONSE_SCHEMA,
  GeminiProspectReasoningProvider,
  _test: {
    cleanString,
    normalizeGroundingText,
    assertGroundedDomainTerms
  }
};
