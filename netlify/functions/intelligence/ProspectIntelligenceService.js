const {
  buildProspectIntelligenceRequest
} = require(
  "./ProspectIntelligenceRequest.js"
);

const {
  buildProspectIntelligenceBrief
} = require(
  "./ProspectIntelligenceBrief.js"
);

class ProspectIntelligenceService {
  constructor({
    researchProvider,
    reasoningProvider,
    clock = () =>
      new Date()
  } = {}) {
    if (
      !researchProvider ||
      typeof researchProvider.research !==
        "function"
    ) {
      throw new Error(
        "ProspectIntelligenceService requires a research provider."
      );
    }

    if (
      !reasoningProvider ||
      typeof reasoningProvider.generateBriefAnalysis !==
        "function"
    ) {
      throw new Error(
        "ProspectIntelligenceService requires a reasoning provider."
      );
    }

    this.researchProvider =
      researchProvider;

    this.reasoningProvider =
      reasoningProvider;

    this.clock =
      clock;
  }

  cleanString(
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

  buildSourceRecord(
    item
  ) {
    if (
      !item ||
      typeof item !==
        "object"
    ) {
      return null;
    }

    const url =
      this.cleanString(
        item.url
      );

    if (!url) {
      return null;
    }

    return {
      title:
        this.cleanString(
          item.title
        ),

      url,

      publisher:
        this.cleanString(
          item.domain
        ),

      publishedAt:
        null,

      observedAt:
        this.cleanString(
          item.observedAt
        ),

      summary:
        this.cleanString(
          item.snippet
        ),

      sourceType:
        this.cleanString(
          item.sourceType
        ),

      sourceQuality:
        this.cleanString(
          item.sourceQuality
        ),

      intent:
        this.cleanString(
          item.intent
        )
    };
  }

  async buildBrief(
    input
  ) {
    const request =
      buildProspectIntelligenceRequest(
        input
      );

    const research =
      request.research
        .includeCurrentResearch
        ? await this
            .researchProvider
            .research({
              prospectName:
                request.prospect
                  .prospectName,

              candidateDomain:
                request.prospect
                  .candidateDomain,

              city:
                request.prospect
                  .location?.city ||
                null,

              state:
                request.prospect
                  .location?.state ||
                null
            })
        : {
            results: [],
            errors: [],
            searchedAt: null
          };

    const researchResults =
      Array.isArray(
        research.results
      )
        ? research.results
        : [];

    const sources =
      researchResults
        .map(
          item =>
            this.buildSourceRecord(
              item
            )
        )
        .filter(Boolean);

    const reasoningInput = {
      request,

      research: {
        searchedAt:
          this.cleanString(
            research.searchedAt
          ),

        results:
          researchResults,

        errors:
          Array.isArray(
            research.errors
          )
            ? research.errors
            : []
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

    const analysis =
      await this
        .reasoningProvider
        .generateBriefAnalysis(
          reasoningInput
        );

    if (
      !analysis ||
      typeof analysis !==
        "object" ||
      Array.isArray(analysis)
    ) {
      throw new Error(
        "Reasoning provider returned an invalid analysis."
      );
    }

    return buildProspectIntelligenceBrief({
      prospectKey:
        request.prospectKey,

      generatedAt:
        this.clock()
          .toISOString(),

      salesContextId:
        request.salesContext
          .contextId,

      companyContext:
        analysis.companyContext ||
        {},

      currentDevelopments:
        analysis.currentDevelopments ||
        [],

      conversationStarters:
        analysis.conversationStarters ||
        [],

      salesRelevance:
        analysis.salesRelevance ||
        [],

      needHypotheses:
        analysis.needHypotheses ||
        [],

      discoveryQuestions:
        analysis.discoveryQuestions ||
        [],

      objectionPreparation:
        analysis.objectionPreparation ||
        [],

      recommendedApproach:
        analysis.recommendedApproach ||
        null,

      outreachIdea:
        analysis.outreachIdea ||
        null,

      sources
    });
  }
}

module.exports = {
  ProspectIntelligenceService
};
