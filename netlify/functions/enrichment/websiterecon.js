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
    const matches =
      html.match(
        /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
      ) || [];

    return [
      ...new Set(
        matches
          .map(
            email =>
              email
                .trim()
                .toLowerCase()
          )
          .filter(
            email =>
              !email.endsWith(".png") &&
              !email.endsWith(".jpg") &&
              !email.endsWith(".jpeg") &&
              !email.includes("wixpress")
          )
      )
    ];
  }

  _extractPhones(html) {
    const matches =
      html.match(
        /(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}/g
      ) || [];

    return [
      ...new Set(
        matches.map(
          phone => phone.trim()
        )
      )
    ];
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
