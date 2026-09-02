class CurrentCompanyResearchProvider {
  constructor({
    googleDiscoveryProvider,
    clock = () =>
      new Date()
  } = {}) {
    if (
      !googleDiscoveryProvider ||
      typeof googleDiscoveryProvider
        .discoverCandidates !==
        "function"
    ) {
      throw new Error(
        "CurrentCompanyResearchProvider requires a Google discovery provider."
      );
    }

    this.googleDiscoveryProvider =
      googleDiscoveryProvider;

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

  normalizeResult(
    item
  ) {
    if (
      !item ||
      typeof item !==
        "object"
    ) {
      return null;
    }

    const title =
      this.cleanString(
        item.title ||
        item.candidateName
      );

    const snippet =
      this.cleanString(
        item.snippet ||
        item.description
      );

    const url =
      this.cleanString(
        item.formattedUrl ||
        item.link ||
        item.website
      );

    if (!url) {
      return null;
    }

    const domain =
      this.cleanString(
        item.candidateDomain ||
        item.domain
      );

    const sourceType =
      this.cleanString(
        item.sourceType ||
        item.classification
      );

    let sourceQuality =
      "STANDARD";

    if (
      sourceType ===
        "directory"
    ) {
      sourceQuality =
        "LOW";

    } else if (
      sourceType ===
        "community"
    ) {
      sourceQuality =
        "CONTEXT_ONLY";

    } else if (
      sourceType ===
        "institutional"
    ) {
      sourceQuality =
        "HIGH";

    }

    return {
      title,
      snippet,
      url,
      domain,
      sourceType,
      sourceQuality
    };
  }

  buildQueries({
    prospectName,
    candidateDomain,
    city,
    state
  }) {
    const company =
      this.cleanString(
        prospectName
      );

    if (!company) {
      throw new Error(
        "prospectName is required."
      );
    }

    const location =
      [
        this.cleanString(
          city
        ),
        this.cleanString(
          state
        )
      ]
        .filter(Boolean)
        .join(" ");

    const domain =
      this.cleanString(
        candidateDomain
      );

    const exactCompany =
      `"${company}"`;

    const queries = [
      {
        intent:
          "CURRENT_DEVELOPMENTS",

        query:
          [
            exactCompany,
            location,
            "(news OR announced OR expansion OR hiring OR acquisition OR partnership)"
          ]
            .filter(Boolean)
            .join(" "),

        dateRestrict:
          "y2"
      },

      {
        intent:
          "BUSINESS_DEVELOPMENTS",

        query:
          [
            exactCompany,
            location,
            "(announcement OR project OR contract OR award OR growth OR leadership)"
          ]
            .filter(Boolean)
            .join(" "),

        dateRestrict:
          "y2"
      }
    ];

    if (domain) {
      queries.push({
        intent:
          "COMPANY_OWNED",

        query:
          `site:${domain} "${company}"`,

        dateRestrict:
          null
      });
    }

    return queries;
  }

  async research({
    prospectName,
    candidateDomain = null,
    city = null,
    state = null,
    perQueryLimit = 3
  } = {}) {
    const queries =
      this.buildQueries({
        prospectName,
        candidateDomain,
        city,
        state
      });

    const queryResults =
      await Promise.all(
        queries.map(
          async querySpec => {
            try {
              const result =
                await this
                  .googleDiscoveryProvider
                  .discoverCandidates(
                    querySpec.query,
                    {
                      city,
                      state
                    },
                    {
                      limit:
                        Math.max(
                          1,
                          Math.min(
                            Number(
                              perQueryLimit
                            ) || 3,
                            3
                          )
                        ),

                      dateRestrict:
                        querySpec.dateRestrict
                    }
                  );

              const candidates =
                Array.isArray(result)
                  ? result
                  : Array.isArray(
                      result?.candidates
                    )
                    ? result.candidates
                    : [];

              const normalizedItems =
                candidates
                  .map(candidate => {
                    const normalized =
                      this.normalizeResult(
                        candidate
                      );

                    if (!normalized) {
                      return null;
                    }

                    const companyOwned =
                      querySpec.intent ===
                        "COMPANY_OWNED";

                    return {
                      intent:
                        querySpec.intent,

                      query:
                        querySpec.query,

                      ...normalized,

                      sourceType:
                        companyOwned
                          ? "company_owned"
                          : normalized.sourceType,

                      sourceQuality:
                        companyOwned
                          ? "FIRST_PARTY"
                          : normalized.sourceQuality
                    };
                  })
                  .filter(Boolean);

              return {
                items:
                  normalizedItems,

                error:
                  null
              };

            } catch (error) {
              return {
                items:
                  [],

                error: {
                  intent:
                    querySpec.intent,

                  query:
                    querySpec.query,

                  message:
                    error?.message ||
                    String(error)
                }
              };
            }
          }
        )
      );

    const items =
      queryResults
        .flatMap(
          result =>
            result.items
        );

    const errors =
      queryResults
        .map(
          result =>
            result.error
        )
        .filter(Boolean);

    const deduped = [];
    const seenUrls =
      new Set();

    for (
      const item
      of items
    ) {
      if (
        seenUrls.has(
          item.url
        )
      ) {
        continue;
      }

      seenUrls.add(
        item.url
      );

      deduped.push(
        item
      );
    }

    return {
      provider:
        "current_company_research",

      prospectName:
        this.cleanString(
          prospectName
        ),

      queries,

      results:
        deduped,

      searchedAt:
        this.clock()
          .toISOString(),

      errors
    };
  }
}

module.exports = {
  CurrentCompanyResearchProvider
};
