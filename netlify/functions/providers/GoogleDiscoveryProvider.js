class GoogleDiscoveryProvider {
  constructor() {
    this.name = "GoogleDiscoveryProvider";

    this.directoryDomains = new Set([
      "yelp.com",
      "angi.com",
      "angieslist.com",
      "homeadvisor.com",
      "thumbtack.com",
      "bbb.org",
      "yellowpages.com",
      "mapquest.com",
      "facebook.com",
      "linkedin.com",
      "instagram.com",
      "nextdoor.com",
      "manta.com",
      "porch.com",
      "houzz.com"
    ]);
  }

  /**
   * Discover potential business candidates.
   *
   * @param {string} query
   * @param {Object} geoContext
   * @param {Object} options
   * @returns {Promise<Array>}
   */
  async discoverCandidates(query, geoContext = {}, options = {}) {
    const apiKey =
      process.env.RYGUY_SEARCH_API_KEY ||
      process.env.LEAD_QUALIFIER_API_KEY;

    const cseId =
      process.env.CORP_COMP_CSE_ID ||
      process.env.DIR_INFO_CSE_ID ||
      process.env.RYGUY_SEARCH_ENGINE_ID;

    const limit = Math.min(
      Math.max(Number(options.limit) || 10, 1),
      10
    );

    if (!apiKey || !cseId) {
      console.warn(
        `[${this.name}] Missing Google Custom Search credentials.`
      );
      return [];
    }

    const searchQuery = this.buildSearchQuery(query, geoContext);

    const searchUrl =
      `https://www.googleapis.com/customsearch/v1` +
      `?key=${encodeURIComponent(apiKey)}` +
      `&cx=${encodeURIComponent(cseId)}` +
      `&q=${encodeURIComponent(searchQuery)}` +
      `&num=${limit}`;

    try {
      const controller = new AbortController();

      const timeoutId = setTimeout(() => {
        controller.abort();
      }, 8000);

      let response;

      try {
        response = await fetch(searchUrl, {
          signal: controller.signal,
          headers: {
            Accept: "application/json"
          }
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");

        throw new Error(
          `Google Custom Search HTTP ${response.status}: ` +
          `${response.statusText}${errorText ? ` - ${errorText}` : ""}`
        );
      }

      const data = await response.json();

      if (!Array.isArray(data.items)) {
        console.warn(
          `[${this.name}] No search results for "${searchQuery}".`
        );

        return [];
      }

      const discoveredAt = new Date().toISOString();

      const candidates = data.items
        .map((item, index) =>
          this.normalizeSearchResult(
            item,
            index,
            searchQuery,
            discoveredAt
          )
        )
        .filter(Boolean);

      return this.dedupeCandidates(candidates);

    } catch (error) {
      const message =
        error?.name === "AbortError"
          ? "Google Custom Search request timed out."
          : error?.message || "Unknown discovery error.";

      console.error(`[${this.name}] ${message}`);

      return [];
    }
  }

  /**
   * Build a geography-aware discovery query.
   */
  buildSearchQuery(query, geoContext = {}) {
    const cleanQuery =
      String(query || "businesses")
        .replace(/\s+/g, " ")
        .trim();

    const cities = Array.isArray(geoContext.cities)
      ? geoContext.cities.filter(Boolean)
      : geoContext.city
        ? [geoContext.city]
        : [];

    const states = Array.isArray(geoContext.states)
      ? geoContext.states.filter(Boolean)
      : geoContext.state
        ? [geoContext.state]
        : [];

    const geographicTerms = [
      ...cities,
      ...states
    ]
      .map(value => String(value).trim())
      .filter(Boolean);

    const locationPart = geographicTerms.join(" ");

    /*
     * Bias toward actual business websites while avoiding an overly
     * restrictive exact-match query.
     */
    const businessTerms =
      '(LLC OR INC OR "CORP" OR "COMPANY" OR "CONTRACTOR")';

    return [
      cleanQuery,
      locationPart,
      businessTerms
    ]
      .filter(Boolean)
      .join(" ");
  }

  /**
   * Convert a Google result into a normalized discovery candidate.
   */
  normalizeSearchResult(
    item,
    index,
    searchQuery,
    discoveredAt
  ) {
    if (!item || !item.link) {
      return null;
    }

    const sourceUrl = item.link;
    const domain = this.extractDomain(sourceUrl);

    if (!domain) {
      return null;
    }

    const candidateName = this.cleanCandidateName(
      item.title || ""
    );

    if (!candidateName) {
      return null;
    }

    const resultType = this.classifyDomain(domain);

    return {
      discoveryIndex: index,

      candidateName,

      candidateDomain: domain,

      snippet: item.snippet || "",

      displayLink: item.displayLink || domain,

      formattedUrl: sourceUrl,

      resultType,

      isLikelyBusiness:
        resultType === "business_candidate",

      discoveryConfidence:
        resultType === "business_candidate"
          ? "medium"
          : "low",

      discoveryEvidence: {
        provider: this.name,
        query: searchQuery,
        sourceUrl,
        discoveredAt
      }
    };
  }

  /**
   * Clean search-engine titles without destroying legitimate
   * hyphenated business names.
   */
  cleanCandidateName(title) {
    let name = String(title || "").trim();

    if (!name) {
      return "";
    }

    /*
     * Remove common search-result suffixes.
     */
    name = name
      .replace(/\s*\|\s*.*$/, "")
      .replace(/\s*[-–—]\s*(Sunbiz|Florida Department.*)$/i, "")
      .replace(/Division of Corporations/gi, "")
      .replace(/Florida Department of State/gi, "")
      .replace(/\bSunbiz\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();

    /*
     * Reject obvious generic/non-business titles.
     */
    const invalidTitles = [
      "search results",
      "home",
      "homepage",
      "contact us",
      "about us",
      "directory"
    ];

    if (
      invalidTitles.some(
        invalid =>
          name.toLowerCase() === invalid
      )
    ) {
      return "";
    }

    return name;
  }

  /**
   * Extract hostname/domain from a result URL.
   */
  extractDomain(url) {
    try {
      const parsed = new URL(url);

      return parsed.hostname
        .toLowerCase()
        .replace(/^www\./, "");

    } catch {
      return "";
    }
  }

  /**
   * Classify search result source.
   */
  classifyDomain(domain) {
    for (const directory of this.directoryDomains) {
      if (
        domain === directory ||
        domain.endsWith(`.${directory}`)
      ) {
        return "directory";
      }
    }

    return "business_candidate";
  }

  /**
   * Deduplicate candidates by normalized domain.
   */
  dedupeCandidates(candidates) {
    const seen = new Set();
    const output = [];

    for (const candidate of candidates) {
      const key =
        candidate.candidateDomain ||
        candidate.candidateName.toLowerCase();

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      output.push(candidate);
    }

    return output;
  }
}

module.exports = { GoogleDiscoveryProvider };
