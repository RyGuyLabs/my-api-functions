/**
 * contactSearch.js
 *
 * Public-contact enrichment layer.
 *
 * IMPORTANT:
 * - This module does NOT claim that a contact is a decision-maker unless
 *   the source explicitly supports that claim.
 * - Publicly observed contact information is returned with provenance.
 * - No fabricated emails, phones, or identities.
 * - Paid providers can be added later without changing the pipeline.
 */

const DEFAULT_TIMEOUT_MS = 5000;

function normalizeLocation(location) {
  if (!location) return {};

  if (typeof location === "string") {
    return {
      display: location
    };
  }

  return {
    city: location.city || null,
    state: location.state || null,
    zip: location.zip || null,
    display: [
      location.city,
      location.state
    ].filter(Boolean).join(", ") || null
  };
}

function normalizePhone(phone) {
  if (!phone) return null;

  const value = String(phone).trim();

  return {
    value,
    source: "public_contact_search",
    confidence: "medium",
    verified: false
  };
}

function normalizeEmail(email) {
  if (!email) return null;

  const value = String(email).trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return null;
  }

  return {
    value,
    source: "public_contact_search",
    confidence: "medium",
    verified: false
  };
}

/**
 * Executes a bounded public search for contact information.
 *
 * This intentionally returns observations rather than pretending
 * that search-engine snippets constitute verified contact ownership.
 */
async function contactSearch(companyName, location, options = {}) {
  const startedAt = Date.now();

  const result = {
    searchedAt: new Date().toISOString(),
    companyName: companyName || null,
    location: normalizeLocation(location),

    primaryPhone: null,
    phones: [],

    publicEmails: [],
    emails: [],

    linkedInCompanyUrl: null,
    website: null,

    observations: [],

    sourceConfidence: "low",
    provider: "public_contact_search",

    status: "unavailable",
    errors: []
  };

  if (!companyName || typeof companyName !== "string") {
    result.errors.push({
      stage: "validation",
      message: "Company name is required."
    });

    return result;
  }

  const apiKey =
    process.env.RYGUY_SEARCH_API_KEY ||
    process.env.LEAD_QUALIFIER_API_KEY;

  const cseId =
    process.env.CORP_COMP_CSE_ID ||
    process.env.DIR_INFO_CSE_ID ||
    process.env.RYGUY_SEARCH_ENGINE_ID;

  /*
   * No API credentials = cleanly skip this provider.
   * This allows the rest of the pipeline to continue operating.
   */
  if (!apiKey || !cseId) {
    result.errors.push({
      stage: "configuration",
      message: "Public contact search provider is not configured."
    });

    return result;
  }

  const locationText = result.location.display || "";

  const query = `"${companyName}" ${locationText} contact phone email`;

  const url =
    `https://www.googleapis.com/customsearch/v1` +
    `?key=${encodeURIComponent(apiKey)}` +
    `&cx=${encodeURIComponent(cseId)}` +
    `&q=${encodeURIComponent(query)}` +
    `&num=5`;

  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, options.timeoutMs || DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json"
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(
        `Search provider returned HTTP ${response.status}`
      );
    }

    const data = await response.json();

    if (!Array.isArray(data.items)) {
      result.status = "no_results";
      return result;
    }

    const phones = new Map();
    const emails = new Map();

    for (const item of data.items) {
      const text = [
        item.title,
        item.snippet,
        item.htmlSnippet
      ]
        .filter(Boolean)
        .join(" ");

      /*
       * Email extraction from search result text.
       * These are observations, NOT verified ownership.
       */
      const foundEmails =
        text.match(
          /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
        ) || [];

      for (const email of foundEmails) {
        const normalized = normalizeEmail(email);

        if (normalized) {
          emails.set(normalized.value, normalized);
        }
      }

      /*
       * Phone extraction.
       */
      const foundPhones =
        text.match(
          /(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}/g
        ) || [];

      for (const phone of foundPhones) {
        const normalized = normalizePhone(phone);

        if (normalized) {
          phones.set(normalized.value, normalized);
        }
      }

      /*
       * Capture useful public company URLs.
       */
      if (!result.website && item.link) {
        result.website = item.link;
      }

      if (
        !result.linkedInCompanyUrl &&
        typeof item.link === "string" &&
        item.link.includes("linkedin.com/company/")
      ) {
        result.linkedInCompanyUrl = item.link;
      }
    }

    result.emails = Array.from(emails.values());
    result.publicEmails = result.emails;

    result.phones = Array.from(phones.values());
    result.primaryPhone = result.phones[0]?.value || null;

    if (
      result.emails.length > 0 ||
      result.phones.length > 0 ||
      result.linkedInCompanyUrl
    ) {
      result.status = "partial";
      result.sourceConfidence = "medium";
    } else {
      result.status = "no_contact_data";
    }

    result.observations.push({
      source: "google_custom_search",
      query,
      resultCount: data.items.length
    });

    return result;

  } catch (error) {
    result.status = "failed";

    result.errors.push({
      stage: "public_contact_search",
      message:
        error.name === "AbortError"
          ? "Contact search timed out."
          : error.message
    });

    return result;

  } finally {
    clearTimeout(timeoutId);

    result.durationMs = Date.now() - startedAt;
  }
}

module.exports = { contactSearch };
