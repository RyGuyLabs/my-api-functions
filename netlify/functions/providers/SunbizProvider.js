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
   * Provider capability declaration.
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
   * Search the Sunbiz public registry.
   *
   * Contract:
   *
   * search(geoContext, filters)
   *
   * Returns a normalized provider result object.
   */
  async search(
    geoContext = {},
    filters = {}
  ) {
    const query =
      filters?.query ||
      filters?.industry ||
      "";

    if (!String(query).trim()) {
      return {
        providerStatus: "success",
        provider: this.name,
        httpStatus: 200,
        records: [],
        errorType: null
      };
    }

    const cleanTerm =
      this.cleanSearchTerm(query);

    if (!cleanTerm) {
      return {
        providerStatus: "success",
        provider: this.name,
        httpStatus: 200,
        records: [],
        errorType: null
      };
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
      const response =
        await this._request(
          searchUrl
        );

      const contentType =
        response.headers.get(
          "content-type"
        ) || null;

      const contentLength =
        response.headers.get(
          "content-length"
        ) || null;

      const location =
        response.headers.get(
          "location"
        ) || null;

      console.log(
        `[${this.name}] HTTP RESPONSE`,
        {
          status:
            response.status,

          ok:
            response.ok,

          contentType,

          contentLength,

          location
        }
      );

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

      console.log(
        `[${this.name}] RESPONSE HEADERS`,
        this.getDiagnosticHeaders(
          response
        )
      );

      // ----------------------------------------------------------------------
      // HTTP FAILURE CLASSIFICATION
      // ----------------------------------------------------------------------

      if (!response.ok) {
        const failure =
          this.classifyHttpFailure(
            response,
            responseBody
          );

        console.warn(
          `[${this.name}] REGISTRY REQUEST FAILED`,
          {
            status:
              response.status,

            providerStatus:
              failure.providerStatus,

            errorType:
              failure.errorType,

            server:
              response.headers.get(
                "server"
              ) || null,

            query:
              cleanTerm
          }
        );

        return {
          providerStatus:
            failure.providerStatus,

          provider:
            this.name,

          httpStatus:
            response.status,

          records:
            [],

          errorType:
            failure.errorType
        };
      }

      // ----------------------------------------------------------------------
      // EMPTY RESPONSE
      // ----------------------------------------------------------------------

      if (!responseBody.trim()) {
        console.warn(
          `[${this.name}] REGISTRY PROVIDER RETURNED EMPTY RESPONSE BODY`,
          {
            status:
              response.status,

            query:
              cleanTerm
          }
        );

        return {
          providerStatus:
            "unavailable",

          provider:
            this.name,

          httpStatus:
            response.status,

          records:
            [],

          errorType:
            "EMPTY_RESPONSE"
        };
      }

      // ----------------------------------------------------------------------
      // CLOUDFLARE CHALLENGE DETECTION
      //
      // This is intentionally checked even after the HTTP status test because
      // challenge pages can occasionally arrive through unexpected statuses.
      // ----------------------------------------------------------------------

      if (
        this.isCloudflareChallenge(
          response,
          responseBody
        )
      ) {
        console.warn(
          `[${this.name}] CLOUDFLARE CHALLENGE DETECTED`,
          {
            status:
              response.status,

            query:
              cleanTerm
          }
        );

        return {
          providerStatus:
            "blocked",

          provider:
            this.name,

          httpStatus:
            response.status,

          records:
            [],

          errorType:
            "CLOUDFLARE_CHALLENGE"
        };
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
          query:
            cleanTerm,

          recordCount:
            records.length
        }
      );

      return {
        providerStatus:
          "success",

        provider:
          this.name,

        httpStatus:
          response.status,

        records,

        errorType:
          null
      };

    } catch (error) {
      console.error(
        `[${this.name} SEARCH FAILURE]`,
        {
          query:
            cleanTerm,

          url:
            searchUrl,

          message:
            error.message,

          name:
            error.name,

          stack:
            error.stack
        }
      );

      let errorType =
        "NETWORK_ERROR";

      if (
        error?.name ===
        "AbortError"
      ) {
        errorType =
          "REQUEST_TIMEOUT";
      }

      if (
        String(
          error?.message || ""
        )
          .toLowerCase()
          .includes("timed out")
      ) {
        errorType =
          "REQUEST_TIMEOUT";
      }

      return {
        providerStatus:
          "unavailable",

        provider:
          this.name,

        httpStatus:
          null,

        records:
          [],

        errorType
      };
    }
  }

  /**
   * Classify an unsuccessful registry HTTP response.
   *
   * This distinguishes:
   * - Cloudflare/browser challenges
   * - rate limiting
   * - server-side registry failures
   * - generic HTTP errors
   */
  classifyHttpFailure(
    response,
    responseBody = ""
  ) {
    const status =
      response?.status;

    if (
      this.isCloudflareChallenge(
        response,
        responseBody
      )
    ) {
      return {
        providerStatus:
          "blocked",

        errorType:
          "CLOUDFLARE_CHALLENGE"
      };
    }

    if (
      status === 429
    ) {
      return {
        providerStatus:
          "rate_limited",

        errorType:
          "RATE_LIMITED"
      };
    }

    if (
      status >= 500 &&
      status <= 599
    ) {
      return {
        providerStatus:
          "unavailable",

        errorType:
          "REGISTRY_SERVER_ERROR"
      };
    }

    if (
      status === 401 ||
      status === 403
    ) {
      return {
        providerStatus:
          "blocked",

        errorType:
          "REGISTRY_ACCESS_DENIED"
      };
    }

    return {
      providerStatus:
        "unavailable",

      errorType:
        "HTTP_ERROR"
    };
  }

  /**
   * Determine whether the response appears to be a Cloudflare challenge.
   *
   * This does NOT attempt to bypass Cloudflare.
   */
  isCloudflareChallenge(
    response,
    responseBody = ""
  ) {
    const server =
      response?.headers?.get(
        "server"
      ) || "";

    const body =
      String(
        responseBody || ""
      ).toLowerCase();

    const serverIndicatesCloudflare =
      server
        .toLowerCase()
        .includes(
          "cloudflare"
        );

    const bodyIndicatesCloudflare =
      body.includes(
        "challenges.cloudflare.com"
      ) ||
      body.includes(
        "just a moment"
      ) ||
      body.includes(
        "cf-chl-"
      ) ||
      body.includes(
        "cloudflare ray id"
      ) ||
      body.includes(
        "challenge-platform"
      );

    return (
      serverIndicatesCloudflare &&
      bodyIndicatesCloudflare
    ) || (
      response?.status === 403 &&
      bodyIndicatesCloudflare
    );
  }

  /**
   * Perform the outbound registry request.
   */
  async _request(url) {
    const controller =
      new AbortController();

    const timeoutId =
      setTimeout(
        () => {
          controller.abort();
        },
        this.timeoutMs
      );

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
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

            "Accept-Language":
              "en-US,en;q=0.9"
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
        const timeoutError =
          new Error(
            `Sunbiz request timed out after ${this.timeoutMs}ms`
          );

        timeoutError.name =
          "AbortError";

        throw timeoutError;
      }

      throw error;

    } finally {
      clearTimeout(
        timeoutId
      );
    }
  }

  /**
   * Create a bounded diagnostic preview.
   *
   * IMPORTANT:
   * Do not log entire provider responses.
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
   * Extract useful response headers for diagnostics.
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
   * Parse the Sunbiz search-result table.
   */
  _parseSunbizTableHtml(
    html,
    sourceUrl,
    limit
  ) {
    const records = [];

    const tableRegex =
      /<table\b[^>]*>([\s\S]*?)<\/table>/gi;

    const tables = [];

    let tableMatch;

    while (
      (
        tableMatch =
          tableRegex.exec(
            html
          )
      ) !== null
    ) {
      tables.push(
        tableMatch[1]
      );
    }

    if (
      tables.length ===
      0
    ) {
      console.warn(
        `[${this.name}] No HTML tables found in registry response.`
      );

      return [];
    }

    const searchResultTable =
      tables.find(
        tableHtml =>
          /SearchResultDetail/i.test(
            tableHtml
          ) ||
          /Inquiry\/CorporationSearch/i.test(
            tableHtml
          ) ||
          /<th\b/i.test(
            tableHtml
          )
      ) ||
      tables[0];

    const rowRegex =
      /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;

    let rowMatch;

    while (
      (
        rowMatch =
          rowRegex.exec(
            searchResultTable
          )
      ) !== null &&
      records.length <
        limit
    ) {
      const rowHtml =
        rowMatch[1];

      if (
        /<th\b/i.test(
          rowHtml
        )
      ) {
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
        !docNum
      ) {
        continue;
      }

      if (
        entityName
          .toLowerCase()
          .includes(
            "corporate name"
          )
      ) {
        continue;
      }

      if (
        docNum
          .toLowerCase()
          .includes(
            "document number"
          )
      ) {
        continue;
      }

      console.log(
        `[${this.name}] PARSED ROW`,
        {
          entityName,
          docNum,
          status
        }
      );

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
   * Extract table cells.
   */
  _extractTableCells(
    rowHtml
  ) {
    const cells = [];

    const cellRegex =
      /<td\b[^>]*>([\s\S]*?)<\/td>/gi;

    let match;

    while (
      (
        match =
          cellRegex.exec(
            rowHtml
          )
      ) !== null
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
        /&apos;/gi,
        "'"
      )
      .replace(
        /\s+/g,
        " "
      )
      .trim();
  }

  /**
   * Normalize a raw Sunbiz record into the canonical provider entity.
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
   * Format normalized location.
   */
  formatLocation(
    location = {}
  ) {
    const parts = [
      location.city,
      location.state,
      location.zip
    ].filter(
      Boolean
    );

    return parts.length
      ? parts.join(", ")
      : "Florida, USA";
  }

  /**
   * Return the authoritative source reference for a record.
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
