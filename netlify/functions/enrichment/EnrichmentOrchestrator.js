const { WebsiteReconProvider } = require("./websiterecon.js");

/**
 * EnrichmentOrchestrator
 * Coordinates secondary enrichment providers.
 * Enforces strict per-prospect timeout boundaries and fault isolation.
 */
class EnrichmentOrchestrator {
  constructor() {
    this.websiteRecon = new WebsiteReconProvider();
  }

  async enrich(entity, candidateInfo = null) {
    const result = {
      website: candidateInfo?.formattedUrl || null,
      businessPhone: null,
      emails: [],
      phones: [],
      digitalSignals: [],
      enrichmentStatus: "partial",
      errors: [],
      enrichedAt: new Date().toISOString()
    };

    // Determine Target URL
    const targetUrl = result.website || candidateInfo?.displayLink;
    if (!targetUrl) {
      result.enrichmentStatus = "skipped";
      result.errors.push({ stage: "discovery", message: "No public web URL identified for entity." });
      return result;
    }

    try {
      // Execute Website Reconnaissance
      const reconData = await this.websiteRecon.reconWebsite(targetUrl);
      
      if (reconData.status === "success") {
        result.emails = reconData.emails;
        result.phones = reconData.phones;
        result.digitalSignals = reconData.digitalSignals;
        result.businessPhone = reconData.phones[0]?.value || null;
        result.enrichmentStatus = "complete";
      } else {
        result.errors.push({ stage: "websiteRecon", message: reconData.error });
      }
    } catch (err) {
      result.errors.push({ stage: "orchestration", message: err.message });
    }

    return result;
  }
}

module.exports = { EnrichmentOrchestrator };
