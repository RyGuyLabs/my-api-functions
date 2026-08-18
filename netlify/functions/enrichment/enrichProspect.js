const { websiteRecon } = require("./websiterecon");
const { contactSearch } = require("./contactSearch");

/**
 * Shared enrichment helper for Firebase and Netlify runtimes.
 *
 * Registry providers establish identity.
 * Discovery providers identify possible web properties.
 * Enrichment providers observe publicly available contact/digital signals.
 *
 * No enrichment result is treated as authoritative registry evidence.
 */
async function enrichProspect(normalized, candidateInfo = null) {
  const startedAt = Date.now();

  const result = {
    website: null,
    contacts: null,
    status: "partial",
    errors: [],
    enrichedAt: new Date().toISOString()
  };

  /*
   * Website can originate from:
   * 1. normalized entity
   * 2. discovery provider
   */
  const targetWebsite =
    normalized?.website ||
    candidateInfo?.formattedUrl ||
    null;

  /*
   * Website reconnaissance.
   */
  if (targetWebsite) {
    try {
      const websiteData =
        await websiteRecon(targetWebsite);

      result.website = websiteData;

      if (
        websiteData &&
        websiteData.status === "success"
      ) {
        result.status = "complete";
      }

    } catch (error) {
      console.error(
        `[WEBSITE RECON FAILED] ${normalized?.companyName || "Prospect"}:`,
        error.message
      );

      result.errors.push({
        stage: "websiteRecon",
        message: error.message
      });
    }
  }

  /*
   * Contact discovery.
   *
   * This remains independent of website reconnaissance because
   * a company may have publicly indexed contact information even
   * when its website cannot be reached.
   */
  try {
    result.contacts = await contactSearch(
      normalized?.companyName,
      normalized?.location
    );

    if (
      result.contacts?.status === "failed"
    ) {
      result.errors.push({
        stage: "contactSearch",
        message:
          result.contacts.errors?.[0]?.message ||
          "Contact search failed."
      });
    }

  } catch (error) {
    console.error(
      `[CONTACT SEARCH FAILED] ${normalized?.companyName || "Prospect"}:`,
      error.message
    );

    result.errors.push({
      stage: "contactSearch",
      message: error.message
    });
  }

  if (
    !result.website &&
    !result.contacts
  ) {
    result.status = "unavailable";
  }

  result.durationMs = Date.now() - startedAt;

  return result;
}

module.exports = { enrichProspect };
