/**
 * WebsiteReconProvider
 *
 * Public website observation layer.
 *
 * IMPORTANT:
 * - Does not establish legal identity.
 * - Does not establish ownership of contact information.
 * - Does not fabricate missing data.
 * - Every observation retains source context.
 */

class WebsiteReconProvider {
  constructor(options = {}) {
    this.name = "WebsiteReconProvider";

    this.timeoutMs =
      options.timeoutMs || 5000;

    this.maxHtmlBytes =
      options.maxHtmlBytes || 2_000_000;
  }

  async reconWebsite(targetUrl) {
    if (!targetUrl || typeof targetUrl !== "string") {
      return this._emptyObservation(
        "Invalid or missing URL"
      );
    }

    const normalizedUrl =
      this._normalizeUrl(targetUrl);

    if (!normalizedUrl) {
      return this._emptyObservation(
        "Invalid or unsafe URL"
      );
    }

    const startedAt = Date.now();
    const controller = new AbortController();

    const timeoutId = setTimeout(
      () => controller.abort(),
      this.timeoutMs
    );

    try {
      const response = await fetch(
        normalizedUrl,
        {
          method: "GET",
          redirect: "follow",
          headers: {
            "User-Agent":
              "RyGuyLabs-LeadEngine/2.0 (+public-business-recon)"
          },
          signal: controller.signal
        }
      );

      if (!response.ok) {
        return this._emptyObservation(
          `HTTP Failure ${response.status}`,
          normalizedUrl
        );
      }

      /*
       * Avoid processing unexpectedly enormous responses.
       */
      const contentLength =
        Number(
          response.headers.get("content-length")
        ) || 0;

      if (
        contentLength > this.maxHtmlBytes
      ) {
        return this._emptyObservation(
          "Response exceeds maximum allowed size",
          normalizedUrl
        );
      }

      const html =
        await response.text();

      if (
        Buffer.byteLength(html, "utf8") >
        this.maxHtmlBytes
      ) {
        return this._emptyObservation(
          "Downloaded HTML exceeds maximum allowed size",
          normalizedUrl
        );
      }

      /*
       * Extract observations.
       */
      const emails =
        this._extractEmails(html);

      const phones =
        this._extractPhones(html);

      const title =
        this._extractTitle(html);

      const structuredData =
        this._extractStructuredData(html);

      const signals =
        this._detectDigitalSignals(
          html,
          emails,
          phones
        );

      return {
        status: "success",

        provider: this.name,

        observedUrl: normalizedUrl,

        finalUrl:
          response.url || normalizedUrl,

        observedAt:
          new Date().toISOString(),

        durationMs:
          Date.now() - startedAt,

        httpStatus:
          response.status,

        contentType:
          response.headers.get("content-type") || null,

        metaTitle: title,

        emails: emails.map(
          value => ({
            value,
            source: "website_recon",
            sourceUrl: normalizedUrl,
            confidence: "medium",
            verified: false
          })
        ),

        phones: phones.map(
          value => ({
            value,
            source: "website_recon",
            sourceUrl: normalizedUrl,
            confidence: "medium",
            verified: false
          })
        ),

        structuredData,

        digitalSignals: signals,

        error: null
      };

    } catch (error) {

      return this._emptyObservation(
        error.name === "AbortError"
          ? "Website reconnaissance timed out"
          : `Recon execution failed: ${error.message}`,
        normalizedUrl
      );

    } finally {
      clearTimeout(timeoutId);
    }
  }

  _normalizeUrl(value) {
    let url;

    try {
      url = new URL(
        value.startsWith("http")
          ? value
          : `https://${value}`
      );
    } catch {
      return null;
    }

    /*
     * Only public HTTP(S) websites.
     */
    if (
      !["http:", "https:"].includes(
        url.protocol
      )
    ) {
      return null;
    }

    const hostname =
      url.hostname.toLowerCase();

    /*
     * Basic SSRF protection.
     */
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname.endsWith(".local")
    ) {
      return null;
    }

    /*
     * Reject obvious private IPv4 ranges.
     */
    const privateIpPatterns = [
      /^10\./,
      /^127\./,
      /^192\.168\./,
      /^169\.254\./,
      /^172\.(1[6-9]|2\d|3[0-1])\./
    ];

    if (
      privateIpPatterns.some(
        regex => regex.test(hostname)
      )
    ) {
      return null;
    }

    return url.toString();
  }

  _extractEmails(html) {
    if (
      typeof html !== "string" ||
      !html
    ) {
      return [];
    }

    const matches =
      html.match(
        /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
      ) || [];

    const placeholderLocalParts =
      new Set([
        "your",
        "you",
        "name",
        "email",
        "example",
        "test",
        "username",
        "user"
      ]);

    const placeholderDomains =
      new Set([
        "email.com",
        "example.com",
        "example.org",
        "example.net",
        "test.com",
        "test.org",
        "domain.com"
      ]);

    const normalized = [];
    const seen = new Set();

    for (
      const match of matches
    ) {
      const email =
        String(match || "")
          .trim()
          .toLowerCase();

      if (!email) {
        continue;
      }

      if (
        email.endsWith(".png") ||
        email.endsWith(".jpg") ||
        email.endsWith(".jpeg") ||
        email.includes("wixpress")
      ) {
        continue;
      }

      const atIndex =
        email.lastIndexOf("@");

      if (
        atIndex <= 0 ||
        atIndex === email.length - 1
      ) {
        continue;
      }

      const localPart =
        email.slice(
          0,
          atIndex
        );

      const domain =
        email.slice(
          atIndex + 1
        );

      if (
        placeholderLocalParts.has(
          localPart
        ) ||
        placeholderDomains.has(
          domain
        )
      ) {
        continue;
      }

      if (
        seen.has(email)
      ) {
        continue;
      }

      seen.add(email);

      normalized.push(
        email
      );

      if (
        normalized.length >= 20
      ) {
        break;
      }
    }

    return normalized;
  }

  _extractPhones(html) {
    if (
      typeof html !== "string" ||
      !html
    ) {
      return [];
    }

    const candidates = [];

    /*
     * 1. Explicit telephone links are the strongest website signal.
     */
    const telRegex =
      /href=["']tel:([^"'?#]+)["']/gi;

    let telMatch;

    while (
      (telMatch = telRegex.exec(html)) !== null
    ) {
      candidates.push(
        telMatch[1]
      );
    }

    /*
     * 2. Remove code-heavy regions before scanning page text.
     *
     * Minified JavaScript, JSON-LD, analytics payloads and CSS frequently
     * contain long digit sequences that resemble North American phone
     * numbers but are not public contact observations.
     */
    const visibleHtml =
      html
        .replace(
          /<script\b[^>]*>[\s\S]*?<\/script>/gi,
          " "
        )
        .replace(
          /<style\b[^>]*>[\s\S]*?<\/style>/gi,
          " "
        )
        .replace(
          /<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi,
          " "
        )
        .replace(
          /<svg\b[^>]*>[\s\S]*?<\/svg>/gi,
          " "
        );

    const textOnly =
      visibleHtml
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&#160;/gi, " ")
        .replace(/\s+/g, " ");

    const visibleMatches =
      textOnly.match(
        /(?:\+?1[\s().-]*)?(?:\(\d{3}\)|\d{3})[\s.-]*\d{3}[\s.-]*\d{4}/g
      ) || [];

    candidates.push(
      ...visibleMatches
    );

    const normalized = [];
    const seen = new Set();

    for (
      const candidate of
      candidates
    ) {
      let digits =
        String(candidate || "")
          .replace(/\D/g, "");

      if (
        digits.length === 11 &&
        digits.startsWith("1")
      ) {
        digits =
          digits.slice(1);
      }

      /*
       * Beta scope: US/Canada-style 10-digit public business phones.
       */
      if (
        digits.length !== 10
      ) {
        continue;
      }

      const areaCode =
        digits.slice(0, 3);

      const exchange =
        digits.slice(3, 6);

      /*
       * Basic NANP sanity checks.
       */
      if (
        areaCode.startsWith("0") ||
        areaCode.startsWith("1") ||
        exchange.startsWith("0") ||
        exchange.startsWith("1")
      ) {
        continue;
      }

      if (
        seen.has(digits)
      ) {
        continue;
      }

      seen.add(digits);

      normalized.push(
        `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
      );

      /*
       * A single business website returning hundreds of alleged phone
       * numbers is not useful contact evidence. Preserve a bounded set.
       */
      if (
        normalized.length >= 20
      ) {
        break;
      }
    }

    return normalized;
  }

  _extractTitle(html) {
    const match =
      html.match(
        /<title[^>]*>([\s\S]*?)<\/title>/i
      );

    return match
      ? match[1]
          .replace(/\s+/g, " ")
          .trim()
      : null;
  }

  _extractStructuredData(html) {
    const results = [];

    const regex =
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

    let match;

    while (
      (match = regex.exec(html)) !== null
    ) {
      try {
        const parsed =
          JSON.parse(match[1].trim());

        results.push(parsed);
      } catch {
        /*
         * Ignore malformed structured data.
         */
      }
    }

    return results;
  }

  _detectDigitalSignals(
    html,
    emails,
    phones
  ) {
    const signals = [];

    const lowerHtml =
      html.toLowerCase();

    if (
      !lowerHtml.includes(
        'name="viewport"'
      ) &&
      !lowerHtml.includes(
        "name='viewport'"
      )
    ) {
      signals.push(
        "WEAK_MOBILE_SIGNAL: No viewport metadata detected."
      );
    }

    if (
      !lowerHtml.includes("gtag") &&
      !lowerHtml.includes("google-analytics") &&
      !lowerHtml.includes("analytics")
    ) {
      signals.push(
        "WEAK_ANALYTICS_SIGNAL: No common analytics marker detected."
      );
    }

    if (emails.length === 0) {
      signals.push(
        "MISSING_PUBLIC_EMAIL: No public email observed."
      );
    }

    if (phones.length === 0) {
      signals.push(
        "MISSING_PUBLIC_PHONE: No public phone observed."
      );
    }

    return signals;
  }

  _emptyObservation(
    errorMessage,
    observedUrl = null
  ) {
    return {
      status: "failed",
      provider: this.name,
      observedUrl,
      finalUrl: null,
      observedAt:
        new Date().toISOString(),
      durationMs: null,
      httpStatus: null,
      contentType: null,
      metaTitle: null,
      emails: [],
      phones: [],
      structuredData: [],
      digitalSignals: [],
      error: errorMessage
    };
  }
}

const websiteReconProvider =
  new WebsiteReconProvider();

async function websiteRecon(
  targetUrl
) {
  return websiteReconProvider.reconWebsite(
    targetUrl
  );
}

module.exports = {
  WebsiteReconProvider,
  websiteRecon
};
