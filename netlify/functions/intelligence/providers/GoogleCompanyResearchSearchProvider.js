class GoogleCompanyResearchSearchProvider {
  constructor() {
    this.name =
      "GoogleCompanyResearchSearchProvider";

    this.directoryDomains =
      new Set([
        "yelp.com",
        "angi.com",
        "angieslist.com",
        "homeadvisor.com",
        "thumbtack.com",
        "bbb.org",
        "yellowpages.com",
        "mapquest.com",
        "manta.com",
        "porch.com",
        "houzz.com"
      ]);

    this.communityDomains =
      new Set([
        "reddit.com",
        "facebook.com",
        "linkedin.com",
        "instagram.com",
        "nextdoor.com"
      ]);
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

  extractDomain(
    url
  ) {
    try {
      return new URL(url)
        .hostname
        .toLowerCase()
        .replace(/^www\./, "");
    } catch {
      return null;
    }
  }

  matchesDomainSet(
    domain,
    domainSet
  ) {
    for (
      const candidateDomain
      of domainSet
    ) {
      if (
        domain === candidateDomain ||
        domain.endsWith(
          `.${candidateDomain}`
        )
      ) {
        return true;
      }
    }

    return false;
  }

  classifyDomain(
    domain
  ) {
    if (!domain) {
      return "unknown";
    }

    if (
      domain.endsWith(".gov") ||
      domain.endsWith(".edu")
    ) {
      return "institutional";
    }

    if (
      this.matchesDomainSet(
        domain,
        this.directoryDomains
      )
    ) {
      return "directory";
    }

    if (
      this.matchesDomainSet(
        domain,
        this.communityDomains
      )
    ) {
      return "community";
    }

    return "public_web";
  }

  async discoverCandidates(
    query,
    geoContext = {},
    options = {}
  ) {
    const apiKey =
      process.env.RYGUY_SEARCH_API_KEY ||
      process.env.LEAD_QUALIFIER_API_KEY;

    const cseId =
      process.env.CORP_COMP_CSE_ID ||
      process.env.DIR_INFO_CSE_ID ||
      process.env.RYGUY_SEARCH_ENGINE_ID;

    if (
      !apiKey ||
      !cseId
    ) {
      throw new Error(
        "Google Custom Search credentials are unavailable."
      );
    }

    const cleanQuery =
      this.cleanString(
        query
      );

    if (!cleanQuery) {
      throw new Error(
        "Research query is required."
      );
    }

    const limit =
      Math.max(
        1,
        Math.min(
          Number(
            options.limit
          ) || 3,
          3
        )
      );

    const dateRestrict =
      this.cleanString(
        options.dateRestrict
      );

    const searchUrl =
      new URL(
        "https://www.googleapis.com/customsearch/v1"
      );

    searchUrl.searchParams.set(
      "key",
      apiKey
    );

    searchUrl.searchParams.set(
      "cx",
      cseId
    );

    searchUrl.searchParams.set(
      "q",
      cleanQuery
    );

    searchUrl.searchParams.set(
      "num",
      String(limit)
    );

    if (dateRestrict) {
      searchUrl.searchParams.set(
        "dateRestrict",
        dateRestrict
      );
    }

    const controller =
      new AbortController();

    const timeout =
      setTimeout(
        () =>
          controller.abort(),
        8000
      );

    try {
      const response =
        await fetch(
          searchUrl,
          {
            signal:
              controller.signal,

            headers: {
              Accept:
                "application/json"
            }
          }
        );

      if (!response.ok) {
        const body =
          await response
            .text()
            .catch(
              () => ""
            );

        throw new Error(
          `Google research search HTTP ${response.status}: ${body}`
        );
      }

      const payload =
        await response.json();

      const items =
        Array.isArray(
          payload.items
        )
          ? payload.items
          : [];

      return items
        .map(
          item => {
            const url =
              this.cleanString(
                item.link
              );

            const domain =
              this.extractDomain(
                url
              );

            if (
              !url ||
              !domain
            ) {
              return null;
            }

            return {
              candidateName:
                this.cleanString(
                  item.title
                ),

              candidateDomain:
                domain,

              formattedUrl:
                url,

              snippet:
                this.cleanString(
                  item.snippet
                ),

              sourceType:
                this.classifyDomain(
                  domain
                )
            };
          }
        )
        .filter(Boolean);

    } catch (error) {
      if (
        error?.name ===
        "AbortError"
      ) {
        throw new Error(
          "Google research search timed out."
        );
      }

      throw error;

    } finally {
      clearTimeout(
        timeout
      );
    }
  }
}

module.exports = {
  GoogleCompanyResearchSearchProvider
};
