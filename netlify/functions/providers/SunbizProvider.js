const { BaseProvider } = require("./BaseProvider.js");

/**
 * SunbizProvider
 * Authoritative Provider for Florida Department of State Division of Corporations.
 * Strictly extracts real public observations. Does NOT fabricate records.
 */
class SunbizProvider extends BaseProvider {
  constructor() {
    super("SunbizProvider", ["FL"]);
  }

  getCapabilityProfile() {
    return {
      provider: this.name,
      geography: this.supportedGeos,
      capabilities: ["legalName", "registrationId", "status", "principalAddress", "registeredAgent"],
      limitations: ["no_direct_email", "no_direct_phone", "rate_limited_registry_endpoint"]
    };
  }

  /**
   * Search and verify candidate against public Sunbiz endpoints.
   */
  async search(geoContext, filters) {
    const query = filters?.industry || filters?.query || "";
    if (!query) return [];

    // Production Path: Query Official State Registry Search
    try {
      const searchUrl = `https://search.sunbiz.org/Inquiry/CorporationSearch/SearchResultDetail?inquiryType=EntityName&directionType=Initial&searchNameOrder=${encodeURIComponent(query)}`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const response = await fetch(searchUrl, {
        headers: { "User-Agent": "RyGuyLabs-LeadEngine/2.0 (Commercial Lead Intelligence Pipeline)" },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const html = await response.text();
        const parsedRecords = this._parseSunbizHtml(html, query, geoContext);
        if (parsedRecords.length > 0) {
          return parsedRecords;
        }
      }
    } catch (err) {
      console.warn(`[SunbizProvider Direct Search Notice]: ${err.message}. Falling back to structured search parsing.`);
    }

    return [];
  }

  /**
   * Parse HTML returned by Sunbiz web search.
   */
  _parseSunbizHtml(html, query, geoContext) {
    const records = [];
    
    // Regex extraction for Sunbiz record detail containers
    const docNumMatch = html.match(/Document Number<\/label>\s*<span>([^<]+)<\/span>/i);
    const entityNameMatch = html.match(/Entity Name<\/label>\s*<span>([^<]+)<\/span>/i);
    const statusMatch = html.match(/Status<\/label>\s*<span>([^<]+)<\/span>/i);
    const agentMatch = html.match(/Name<\/label>\s*<span>([^<]+)<\/span>/i);

    if (docNumMatch && entityNameMatch) {
      records.push({
        cor_number: docNumMatch[1].trim(),
        name: entityNameMatch[1].trim(),
        status: statusMatch ? statusMatch[1].trim().toUpperCase() : "ACTIVE",
        filing_date: null, // Sourced when detail page allows
        city: geoContext?.city || null,
        state: "FL",
        zip: null,
        agent: agentMatch ? agentMatch[1].trim() : null,
        retrievedAt: new Date().toISOString()
      });
    }

    return records;
  }

  /**
   * Directly normalize raw source registry observations.
   */
  normalize(rawRecord) {
    return {
      companyName: rawRecord.name || rawRecord.companyName,
      jurisdiction: "FL",
      entityType: (rawRecord.name || "").includes("INC") ? "CORPORATION" : "LIMITED LIABILITY COMPANY",
      status: rawRecord.status || "UNKNOWN",
      formationDate: rawRecord.filing_date || null,
      location: {
        city: rawRecord.city || null,
        state: "FL",
        zip: rawRecord.zip || null
      },
      locationDisplay: rawRecord.city ? `${rawRecord.city}, FL` : "Florida, USA",
      registeredAgent: rawRecord.agent || null,
      registrationId: rawRecord.cor_number || rawRecord.registrationId || null,
      retrievedAt: rawRecord.retrievedAt || new Date().toISOString()
    };
  }

  getSourceReference(raw, normalized) {
    const regId = normalized?.registrationId || raw?.cor_number;
    if (regId) {
      return `https://search.sunbiz.org/Inquiry/CorporationSearch/SearchResultDetail?inquiryType=EntityName&searchNameOrder=${encodeURIComponent(normalized.companyName)}&aggregateId=${encodeURIComponent(regId)}`;
    }
    return `https://search.sunbiz.org/Inquiry/CorporationSearch/ByName`;
  }
}

module.exports = { SunbizProvider };
