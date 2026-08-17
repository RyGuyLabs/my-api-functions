/**
 * src/enrichment/contactSearch.js
 * Enriches prospect objects with public contact channels.
 */
export async function contactSearch(companyName, location) {
  return {
    searchedAt: new Date().toISOString(),
    primaryPhone: null,
    publicEmails: [],
    linkedInCompanyUrl: null,
    sourceConfidence: "low"
  };
}
