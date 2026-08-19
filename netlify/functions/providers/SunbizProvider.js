const { BaseProvider } = require("./BaseProvider.js");

/**
 * SunbizProvider
 *
 * Authoritative Provider:
 * Florida Department of State
 * Division of Corporations / Sunbiz
 *
 * RESPONSIBILITY:
 * - Discover Florida corporate registration records.
 * - Extract only observations actually present in Sunbiz responses.
 * - Preserve source URLs and retrieval timestamps.
 *
 * DOES NOT:
 * - Invent contact information.
 * - Infer a company's location from the user's search location.
 * - Assign sales qualification scores.
 * - Determine whether a company is a good prospect.
 * - Perform website/contact enrichment.
 */
class SunbizProvider extends BaseProvider {
  constructor() {
    super("SunbizProvider", ["FL"]);

    this.baseUrl =
      "https://search.sunbiz.org";

    this.searchPath =
      "/Inquiry/CorporationSearch/ByName";

    this.defaultLimit = 10;
    this.maxLimit = 50;
    this.timeoutMs = 8000;
  }

  /**
   * Describe the provider's actual capabilities.
   */
  getCapabilityProfile() {
    return {
      provider: this.name,

      geography: this.supportedGeos,

      authority:
        "Florida Department of State Division of Corporations",

      sourceType:
        "official_public_registry",

      capabilities: [
        "legalName",
        "registrationId",
        "status",
        "entityType",
        "filingDate",
        "principalAddress",
        "registeredAgent"
      ],

      limitations: [
        "no_direct_email",
        "no_direct_phone",
        "no_revenue",
        "no_employee_count",
        "no_sales_intent",
        "no_website_quality_assessment",
        "registry_search_rate_limited"
      ]
    };
  }

  /**
   * Search Sunbiz for candidate corporate records.
   *
   * IMPORTANT:
   * Search results are registry observations, not qualified leads.
   */
  async search(geoContext = {}, filters = {}) {
  const query =
    filters?.query ||
    filters?.industry ||
    "";

  if (!query.trim()) {
    return [];
  }

  const cleanTerm =
    this.cleanSearchTerm(query);

  if (!cleanTerm) {
    return [];
  }

  const limit =
    this.normalizeLimit(filters?.limit);

  const searchUrl =
    `${this.baseUrl}${this.searchPath}` +
    `?searchTerm=${encodeURIComponent(cleanTerm)}`;

  console.log(
    `[${this.name}] SEARCH START`,
    {
      query: cleanTerm,
      url: searchUrl,
      geoContext,
      limit
    }
  );

  try {
    const response =
      await this._request(searchUrl);

    console.log(
      `[${this.name}] HTTP RESPONSE`,
      {
        status: response.status,
        ok: response.ok,
        contentType:
          response.headers.get("content-type") || null
      }
    );

    if (!response.ok) {
      throw new Error(
        `Sunbiz returned HTTP ${response.status}`
      );
    }

    const html =
      await response.text();

    console.log(
      `[${this.name}] RESPONSE BODY`,
      {
        length: html.length,
        preview:
          html
            .replace(/\s+/g, " ")
            .slice(0, 500)
      }
    );

    if (!html) {
      throw new Error(
        "Sunbiz returned an empty response body."
      );
    }

    const records =
      this._parseSunbizTableHtml(
        html,
        searchUrl,
        limit
      );

    console.log(
      `[${this.name}] PARSE RESULT`,
      {
        query: cleanTerm,
        recordCount: records.length
      }
    );

    return records;

  } catch (error) {

    console.error(
      `[${this.name} SEARCH FAILURE]`,
      {
        query: cleanTerm,
        url: searchUrl,
        message: error.message,
        stack: error.stack
      }
    );

    throw error;
  }
}

  /**
   * Perform controlled HTTP request to Sunbiz.
   */
  async _request(url) {
  const controller =
    new AbortController();

  const timeoutId =
    setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

  try {
    return await fetch(url, {
      method: "GET",

      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",

        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",

        "Accept-Language":
          "en-US,en;q=0.9",

        "Cache-Control":
          "no-cache",

        "Pragma":
          "no-cache"
      },

      redirect: "follow",

      signal: controller.signal
    });

  } catch (error) {

    if (error?.name === "AbortError") {
      throw new Error(
        `Sunbiz request timed out after ${this.timeoutMs}ms`
      );
    }

    throw error;

  } finally {
    clearTimeout(timeoutId);
  }
}

  /**
   * Normalize search term.
   */
  cleanSearchTerm(value) {
    return String(value || "")
      .replace(/["']/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200);
  }

  /**
   * Normalize requested result count.
   */
  normalizeLimit(value) {
    const parsed =
      Number.parseInt(value, 10);

    if (!Number.isFinite(parsed)) {
      return this.defaultLimit;
    }

    return Math.min(
      Math.max(parsed, 1),
      this.maxLimit
    );
  }

  /**
   * Parse Sunbiz search result HTML.
   *
   * IMPORTANT:
   * This parser only maps values that are actually present
   * in the returned registry HTML.
   *
   * It does NOT manufacture location, filing date,
   * registered-agent, or status values.
   */
  _parseSunbizTableHtml(
    html,
    sourceUrl,
    limit
  ) {
    const records = [];

    /*
     * Current parser targets the known Sunbiz result-row
     * structure. Keep this method isolated so it can be
     * replaced with a DOM parser if Sunbiz markup changes.
     */
    const rowRegex =
      /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;

    let rowMatch;

    while (
      (rowMatch = rowRegex.exec(html)) !== null &&
      records.length < limit
    ) {
      const rowHtml =
        rowMatch[1];

      const cells =
        this._extractTableCells(
          rowHtml
        );

      if (cells.length < 3) {
  continue;
}

console.log(
  `[${this.name}] PARSED ROW`,
  {
    cells
  }
);

      const entityName =
        this.cleanText(cells[0]);

      const docNum =
        this.cleanText(cells[1]);

      const status =
        this.cleanText(cells[2]);

      if (!entityName || !docNum) {
        continue;
      }

      /*
       * Never substitute search geography for actual
       * registry geography.
       */
      records.push({
        cor_number: docNum,

        name: entityName,

        status:
          status || "UNKNOWN",

        filing_date: null,

        city: null,

        state: "FL",

        zip: null,

        agent: null,

        source_url: sourceUrl,

        sourceType:
          "official_public_registry",

        provider:
          this.name,

        retrievedAt:
          new Date().toISOString()
      });
    }

    return records;
  }

  /**
   * Extract table-cell text while tolerating nested markup.
   */
  _extractTableCells(rowHtml) {
    const cells = [];

    const cellRegex =
      /<td\b[^>]*>([\s\S]*?)<\/td>/gi;

    let match;

    while (
      (match = cellRegex.exec(rowHtml)) !== null
    ) {
      cells.push(
        this.cleanText(
          match[1]
        )
      );
    }

    return cells;
  }

  /**
   * Remove HTML and normalize whitespace.
   */
  cleanText(value) {
    return String(value || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&nbsp;/gi, " ")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Normalize raw provider observation into the universal
   * Prospect entity structure.
   *
   * Missing values remain null.
   */
  normalize(rawRecord = {}) {
    const companyName =
      rawRecord.name ||
      rawRecord.companyName ||
      null;

    const registrationId =
      rawRecord.cor_number ||
      rawRecord.registrationId ||
      null;

    const location = {
      city:
        rawRecord.city || null,

      state:
        rawRecord.state || "FL",

      zip:
        rawRecord.zip || null
    };

    return {
      companyName,

      jurisdiction: "FL",

      entityType:
        rawRecord.entityType ||
        null,

      status:
        rawRecord.status ||
        "UNKNOWN",

      formationDate:
        rawRecord.filing_date ||
        rawRecord.formationDate ||
        null,

      location,

      locationDisplay:
        this.formatLocation(location),

      registeredAgent:
        rawRecord.agent ||
        rawRecord.registeredAgent ||
        null,

      registrationId,

      sourceUrl:
        rawRecord.source_url ||
        null,

      sourceType:
        rawRecord.sourceType ||
        "official_public_registry",

      provider:
        this.name,

      retrievedAt:
        rawRecord.retrievedAt ||
        new Date().toISOString()
    };
  }

  /**
   * Convert structured location into UI-safe display text.
   */
  formatLocation(location = {}) {
    const parts = [
      location.city,
      location.state,
      location.zip
    ].filter(Boolean);

    return parts.length
      ? parts.join(", ")
      : "Florida, USA";
  }

  /**
   * Generate authoritative source reference.
   */
  getSourceReference(
    raw,
    normalized
  ) {
    if (raw?.source_url) {
      return raw.source_url;
    }

    const registrationId =
      normalized?.registrationId ||
      raw?.cor_number;

    if (!registrationId) {
      return `${this.baseUrl}${this.searchPath}`;
    }

    const companyName =
      normalized?.companyName ||
      raw?.name ||
      "";

    return (
      `${this.baseUrl}` +
      `/Inquiry/CorporationSearch/SearchResultDetail` +
      `?inquiryType=EntityName` +
      `&searchNameOrder=${encodeURIComponent(companyName)}` +
      `&aggregateId=${encodeURIComponent(registrationId)}`
    );
  }
}

module.exports = {
  SunbizProvider
};
