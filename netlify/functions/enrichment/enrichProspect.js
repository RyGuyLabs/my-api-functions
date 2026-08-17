const { websiteRecon } = require("./websiterecon");
const { contactSearch } = require("./contactSearch");

/**
 * Shared enrichment helper for both Firebase and Netlify runtimes.
 * Prevents logic drift and provides safe error boundaries around external calls.
 */
async function enrichProspect(normalized) {
  let websiteData = null;
  let contactData = null;

  if (normalized.website) {
    try {
      websiteData = await websiteRecon(normalized.website);
    } catch (error) {
      console.error(
        `[WEBSITE RECON FAILED] ${normalized.companyName || 'Prospect'}:`,
        error.message
      );
    }
  }

  try {
    contactData = await contactSearch(
      normalized.companyName,
      normalized.location
    );
  } catch (error) {
    console.error(
      `[CONTACT SEARCH FAILED] ${normalized.companyName || 'Prospect'}:`,
      error.message
    );
  }

  return {
    website: websiteData,
    contacts: contactData
  };
}

module.exports = { enrichProspect };
