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
   * Search results are registry observations,
   * not qualified leads.
   */
  async search(
    geoContext = {},
    filters = {}
  ) {
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
      this.normalizeLimit(
        filters?.limit
      );

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
      // ----------------------------------------------------------------------
      // HTTP REQUEST
      // ----------------------------------------------------------------------

      const response =
        await this._request(
          searchUrl
        );

      console.log(
        `[${this.name}] HTTP RESPONSE`,
        {
          status:
            response.status,

          ok:
            response.ok,

          contentType:
            response.headers.get(
              "content-type"
            ) || null,

          contentLength:
            response.headers.get(
              "content-length"
            ) || null,

          location:
            response.headers.get(
              "location"
            ) || null
        }
      );

      // ----------------------------------------------------------------------
      // IMPORTANT:
      //
      // Read the response body ONCE.
      //
      // We need the body even for an HTTP error because a 403 response
      // may contain diagnostic information explaining why Sunbiz rejected
      // the request.
      // ----------------------------------------------------------------------

      const responseBody =
        await response.text();

      console.log(
        `[${this.name}] RESPONSE BODY DIAGNOSTIC`,
        {
          status:
            response.status,

          length:
            responseBody.length,

          preview:
            this.createSafePreview(
              responseBody
            )
        }
      );

      // ----------------------------------------------------------------------
      // RESPONSE HEADERS
      //
      // Useful for determining whether the response came from an upstream
      // access-control layer, redirect, proxy, CDN, or the application.
      // ----------------------------------------------------------------------

      console.log(
        `[${this.name}] RESPONSE HEADERS`,
        this.getDiagnosticHeaders(
          response
        )
      );

      // ----------------------------------------------------------------------
      // HTTP FAILURE
      // ----------------------------------------------------------------------

      if (!response.ok) {

        throw new Error(
          `Sunbiz returned HTTP ${response.status}`
        );
      }

      // ----------------------------------------------------------------------
      // EMPTY RESPONSE
      // ----------------------------------------------------------------------

      if (!responseBody) {

        throw new Error(
          "Sunbiz returned an empty response body."
        );
      }

      // ----------------------------------------------------------------------
      // PARSE REGISTRY HTML
      // ----------------------------------------------------------------------

      const records =
        this._parseSunbizTableHtml(
          responseBody,
          searchUrl,
          limit
        );

      console.log(
        `[${this.name}] PARSE RESULT`,
        {
          query: cleanTerm,
          recordCount:
            records.length
        }
      );

      return records;

    } catch (error) {

      console.error(
        `[${this.name} SEARCH FAILURE]`,
        {
          query: cleanTerm,

          url:
            searchUrl,

          message:
            error.message,

          stack:
            error.stack
        }
      );

      // ----------------------------------------------------------------------
      // IMPORTANT:
      //
      // Provider failure is NOT the same thing as "zero results."
      //
      // The pipeline intentionally receives the exception so the API can
      // report provider failure rather than falsely telling the user that
      // the registry contained no matching companies.
      // ----------------------------------------------------------------------

      throw error;
    }
  }

  /**
   * Perform controlled HTTP request to Sunbiz.
   *
   * IMPORTANT:
   * These headers describe a normal browser-style request.
   * They are not intended to bypass access controls.
   */
  async _request(url) {
    const controller =
      new AbortController();

    const timeoutId =
      setTimeout(() => {
        controller.abort();
      }, this.timeoutMs);

    try {

      return await fetch(
        url,
        {
          method:
            "GET",

          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",

            "Accept":
              "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",

            "Accept-Language":
              "en-US,en;q=0.9",

            "Sec-Ch-Ua":
              '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',

            "Sec-Ch-Ua-Mobile":
              "?0",

            "Sec-Ch-Ua-Platform":
              '"Windows"',

            "Sec-Fetch-Dest":
              "document",

            "Sec-Fetch-Mode":
              "navigate",

            "Sec-Fetch-Site":
              "none",

            "Sec-Fetch-User":
              "?1",

            "Upgrade-Insecure-Requests":
              "1",

            "Cache-Control":
              "max-age=0"
          },

          redirect:
            "follow",

          signal:
            controller.signal
        }
      );

    } catch (error) {

      if (
        error?.name ===
        "AbortError"
      ) {

        throw new Error(
          `Sunbiz request timed out after ${this.timeoutMs}ms`
        );
      }

      throw error;

    } finally {

      clearTimeout(
        timeoutId
      );
    }
  }

  /**
   * Produce a bounded diagnostic preview of the provider response.
   *
   * IMPORTANT:
   * We intentionally do not dump the entire HTML response into
   * Netlify logs.
   */
  createSafePreview(
    value
  ) {
    return String(
      value || ""
    )
      .replace(
        /\s+/g,
        " "
      )
      .trim()
      .slice(
        0,
        1500
      );
  }

  /**
   * Extract a small set of diagnostic response headers.
   *
   * These are intentionally limited to headers useful for diagnosing
   * HTTP access, redirects, caching, and upstream request handling.
   */
  getDiagnosticHeaders(
    response
  ) {
    const headerNames = [
      "content-type",
      "content-length",
      "location",
      "server",
      "date",
      "cache-control",
      "retry-after",
      "via",
      "x-cache",
      "x-cache-hits",
      "x-request-id",
      "cf-ray"
    ];

    const headers = {};

    for (
      const name of headerNames
    ) {

      const value =
        response.headers.get(
          name
        );

      if (value) {
        headers[name] =
          value;
      }
    }

    return headers;
  }

  /**
   * Normalize search term.
   */
  cleanSearchTerm(
    value
  ) {
    return String(
      value || ""
    )
      .replace(
        /["']/g,
        ""
      )
      .replace(
        /\s+/g,
        " "
      )
      .trim()
      .slice(
        0,
        200
      );
  }

  /**
   * Normalize requested result count.
   */
  normalizeLimit(
    value
  ) {
    const parsed =
      Number.parseInt(
        value,
        10
      );

    if (
      !Number.isFinite(
        parsed
      )
    ) {
      return this.defaultLimit;
    }

    return Math.min(
      Math.max(
        parsed,
        1
      ),
      this.maxLimit
    );
  }

  /**
   * Parse Sunbiz search result HTML.
   *
   * IMPORTANT:
   * Target the search results table specifically to skip layout/header tables,
   * and ignore header rows or navigation links.
   */
  _parseSunbizTableHtml(
    html,
    sourceUrl,
    limit
  ) {
    const records = [];

    const tableMatch = html.match(/<table\b[^>]*>([\s\S]*?)<\/table>/gi);
    if (!tableMatch) return [];

    const searchResultTable = tableMatch.find(tbl => 
      tbl.includes("SearchResultDetail") || 
      tbl.includes("Inquiry/CorporationSearch") || 
      tbl.includes("<th")
    ) || tableMatch[0];

    const rowRegex =
      /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;

    let rowMatch;

    while (
      (rowMatch =
        rowRegex.exec(searchResultTable)) !== null &&
      records.length <
        limit
    ) {

      const rowHtml =
        rowMatch[1];

      if (/<th\b/i.test(rowHtml)) {
        continue;
      }

      const cells =
        this._extractTableCells(
          rowHtml
        );

      if (
        cells.length <
        3
      ) {
        continue;
      }

      const entityName =
        this.cleanText(
          cells[0]
        );

      const docNum =
        this.cleanText(
          cells[1]
        );

      const status =
        this.cleanText(
          cells[2]
        );

      if (
        !entityName ||
        !docNum ||
        entityName.toLowerCase().includes("corporate name") ||
        docNum.toLowerCase().includes("document number")
      ) {
        continue;
      }

      console.log(
        `[${this.name}] PARSED ROW`,
        {
          cells
        }
      );

      /*
       * Never substitute search geography for actual
       * registry geography.
       */
      records.push({
        cor_number:
          docNum,

        name:
          entityName,

        status:
          status ||
          "UNKNOWN",

        filing_date:
          null,

        city:
          null,

        state:
          "FL",

        zip:
          null,

        agent:
          null,

        source_url:
          sourceUrl,

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
  _extractTableCells(
    rowHtml
  ) {
    const cells = [];

    const cellRegex =
      /<td\b[^>]*>([\s\S]*?)<\/td>/gi;

    let match;

    while (
      (match =
        cellRegex.exec(
          rowHtml
        )) !== null
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
  cleanText(
    value
  ) {
    return String(
      value || ""
    )
      .replace(
        /<[^>]+>/g,
        " "
      )
      .replace(
        /&amp;/gi,
        "&"
      )
      .replace(
        /&nbsp;/gi,
        " "
      )
      .replace(
        /&quot;/gi,
        '"'
      )
      .replace(
        /&#39;/gi,
        "'"
      )
      .replace(
        /\s+/g,
        " "
      )
      .trim();
  }

  /**
   * Normalize raw provider observation into the universal
   * Prospect entity structure.
   *
   * Missing values remain null.
   */
  normalize(
    rawRecord = {}
  ) {
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
        rawRecord.city ||
        null,

      state:
        rawRecord.state ||
        "FL",

      zip:
        rawRecord.zip ||
        null
    };

    return {
      companyName,

      jurisdiction:
        "FL",

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
        this.formatLocation(
          location
        ),

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
  formatLocation(
    location = {}
  ) {
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
    if (
      raw?.source_url
    ) {
      return raw.source_url;
    }

    const registrationId =
      normalized?.registrationId ||
      raw?.cor_number;

    if (
      !registrationId
    ) {
      return (
        `${this.baseUrl}` +
        `${this.searchPath}`
      );
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
