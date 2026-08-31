class ProspectSearchService {
  constructor({
    discoveryProvider,
    registryReconciler = null
  } = {}) {
    if (!discoveryProvider) {
      throw new Error(
        "ProspectSearchService requires a discovery provider."
      );
    }

    this.discoveryProvider =
      discoveryProvider;

    this.registryReconciler =
      registryReconciler;
  }

  normalizeText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  containsCityEvidence(
    candidate,
    city
  ) {
    const cleanCity =
      this.normalizeText(city)
        .toLowerCase();

    if (!cleanCity) {
      return false;
    }

    const haystack =
      [
        candidate?.candidateName,
        candidate?.snippet,
        candidate?.displayLink
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

    return haystack.includes(
      cleanCity
    );
  }

  calculateDiscoveryPositionBonus(
    candidate
  ) {
    const index =
      Number(
        candidate?.discoveryIndex
      );

    if (
      !Number.isInteger(index) ||
      index < 0
    ) {
      return 0;
    }

    return Math.max(
      10 - index,
      1
    );
  }

  calculatePriorityScore({
    candidate,
    reconciliation,
    city,
    state
  }) {
    let score = 50;

    const reasons = [
      "Direct business website discovered through the configured search provider."
    ];

    if (
      candidate?.discoveryConfidence ===
      "medium"
    ) {
      score += 10;

      reasons.push(
        "Discovery provider classified the result as a likely direct business website."
      );
    }

    if (
      this.containsCityEvidence(
        candidate,
        city
      )
    ) {
      score += 10;

      reasons.push(
        "Search result explicitly references the requested city."
      );
    }

    const discoveryPositionBonus =
      this.calculateDiscoveryPositionBonus(
        candidate
      );

    if (discoveryPositionBonus > 0) {
      score +=
        discoveryPositionBonus;

      reasons.push(
        `Discovery result position contributed ${discoveryPositionBonus} relevance point${discoveryPositionBonus === 1 ? "" : "s"}.`
      );
    }

    if (
      reconciliation?.status ===
      "registry_matched"
    ) {
      score += 20;

      reasons.push(
        "Candidate matched an entity in the currently loaded Florida registry dataset."
      );

      if (
        Number(
          reconciliation.confidence
        ) >= 0.9
      ) {
        score += 10;

        reasons.push(
          "Registry-name reconciliation produced a strong identity match."
        );
      }
    }

    return {
      score:
        Math.min(
          Math.max(score, 0),
          100
        ),

      reasons
    };
  }

  async search({
    industry,
    city,
    state = "FL",
    discoveryLimit = 10
  } = {}) {
    const cleanIndustry =
      this.normalizeText(
        industry
      );

    const cleanCity =
      this.normalizeText(
        city
      );

    const cleanState =
      this.normalizeText(
        state
      )
        .toUpperCase();

    if (!cleanIndustry) {
      throw new Error(
        "ProspectSearchService requires an industry."
      );
    }

    if (!cleanState) {
      throw new Error(
        "ProspectSearchService requires a state."
      );
    }

    const discovered =
      await this.discoveryProvider
        .discoverCandidates(
          cleanIndustry,
          {
            city:
              cleanCity || null,

            states: [
              cleanState
            ]
          },
          {
            limit:
              discoveryLimit
          }
        );

    const allCandidates =
      Array.isArray(discovered)
        ? discovered
        : [];

    const businessCandidates =
      allCandidates.filter(
        candidate =>
          candidate?.resultType ===
            "business_candidate" &&
          candidate?.isLikelyBusiness ===
            true
      );

    const excludedSources =
      allCandidates
        .filter(
          candidate =>
            !businessCandidates.includes(
              candidate
            )
        )
        .map(candidate => ({
          candidateName:
            candidate?.candidateName ||
            null,

          candidateDomain:
            candidate?.candidateDomain ||
            null,

          resultType:
            candidate?.resultType ||
            "unknown"
        }));

    const prospects = [];

    for (
      const candidate of
        businessCandidates
    ) {
      let reconciliation = {
        status:
          "registry_not_attempted",

        registryMatch:
          null,

        confidence:
          0,

        alternatives:
          []
      };

      if (
        cleanState === "FL" &&
        this.registryReconciler
      ) {
        reconciliation =
          await this.registryReconciler
            .reconcile(
              candidate,
              {
                city:
                  cleanCity || null,

                state:
                  cleanState
              }
            );
      }

      const priority =
        this.calculatePriorityScore({
          candidate,
          reconciliation,
          city:
            cleanCity,
          state:
            cleanState
        });

      prospects.push({
        prospectName:
          reconciliation
            ?.registryMatch
            ?.companyName ||
          candidate.candidateName,

        candidateName:
          candidate.candidateName,

        candidateDomain:
          candidate.candidateDomain,

        website:
          candidate.formattedUrl ||
          null,

        snippet:
          candidate.snippet ||
          "",

        discovery: {
          provider:
            candidate
              ?.discoveryEvidence
              ?.provider ||
            this.discoveryProvider.name ||
            "DiscoveryProvider",

          confidence:
            candidate.discoveryConfidence ||
            null,

          resultType:
            candidate.resultType,

          sourceUrl:
            candidate
              ?.discoveryEvidence
              ?.sourceUrl ||
            candidate.formattedUrl ||
            null
        },

        registry: {
          status:
            reconciliation.status,

          confidence:
            reconciliation.confidence ||
            0,

          entity:
            reconciliation.registryMatch ||
            null
        },

        priorityScore:
          priority.score,

        rankingReasons:
          priority.reasons,

        enrichment: {
          status:
            "not_attempted"
        }
      });
    }

    prospects.sort(
      (a, b) =>
        b.priorityScore -
          a.priorityScore ||
        String(a.prospectName)
          .localeCompare(
            String(b.prospectName)
          )
    );

    return {
      status:
        "success",

      query: {
        industry:
          cleanIndustry,

        city:
          cleanCity || null,

        state:
          cleanState
      },

      discoveredCount:
        allCandidates.length,

      prospectCount:
        prospects.length,

      excludedCount:
        excludedSources.length,

      prospects,

      excludedSources
    };
  }
}

module.exports = {
  ProspectSearchService
};
