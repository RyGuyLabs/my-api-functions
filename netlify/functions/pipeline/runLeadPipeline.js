const { SunbizProvider } = require("../providers/SunbizProvider");
const { EvidenceLedgerAdapter } = require("../ledger/EvidenceLedgerAdapter");
const { enrichProspect } = require("../enrichment/enrichProspect");

/**
 * Core Lead Pipeline Execution Engine
 * Pure business logic called by both Firebase and Netlify adapters.
 *
 * @param {Object} params
 * @param {Object} [params.geoContext] - Geographic constraints (e.g., { states: ["FL"] })
 * @param {Object} [params.filters] - Query parameters (e.g., { industry: "Roofing" })
 * @returns {Promise<Object>} Unified pipeline output with leads payload and legacy root properties.
 */
async function runLeadPipeline({ geoContext, filters = {} }) {
  const provider = new SunbizProvider();
  const ledger = new EvidenceLedgerAdapter();

  const queryInput = filters.industry || "Roofing Contractors";
  const searchGeo = geoContext || { states: ["FL"] };

  // 1. Search candidate records from registry provider
  const rawRecords = await provider.search(searchGeo, { industry: queryInput });

  if (!rawRecords || rawRecords.length === 0) {
    return {
      status: "empty",
      count: 0,
      leads: [],
      prospectName: `No live registry records found for "${queryInput}"`,
      location: { state: "FL" },
      locationDisplay: "FL",
      score: null,
      priority: "UNQUALIFIED",
      reasons: ["Provider query yielded 0 candidate records."],
      enrichment: null,
      evidenceLedger: null
    };
  }

  const leads = [];

  // 2. Controlled processing loop to prevent enrichment rate-limit thundering herds
  for (const raw of rawRecords) {
    const normalized = provider.normalize ? provider.normalize(raw) : raw;

    // Resolve specific registry document source URL
    const recordDocNum = normalized.docNumber || raw.docNumber || raw.corId;
    const sourceUrl = recordDocNum 
      ? `https://search.sunbiz.org/Inquiry/CorporationSearch/SearchResultDetail?inquiryType=EntityName&directionType=Initial&searchNameOrder=${encodeURIComponent(normalized.companyName)}&aggregateId=${recordDocNum}`
      : "https://search.sunbiz.org/";

    // Record observation in Evidence Ledger with dual-hash bounds
    const evidenceEntry = ledger.recordObservation({
      providerName: provider.name || "SunbizProvider",
      rawPayload: raw,
      normalizedEntity: normalized,
      sourceUrl: sourceUrl,
      retrievedAt: new Date().toISOString()
    });

    // Execute unified website & contact enrichment
    const enrichment = await enrichProspect(normalized);

    // Format location display string safely while preserving raw object
    const location = normalized.location || {};
    let locationDisplay = "Florida";

    if (typeof location === "string") {
      locationDisplay = location;
    } else if (location && typeof location === "object") {
      locationDisplay = [location.city, location.state]
        .filter(Boolean)
        .join(", ") || "Florida";
    }

    leads.push({
      prospectId: `prospect_${evidenceEntry.inputSignalId || Date.now()}`,
      prospectName: normalized.companyName || normalized.name || "Active Prospect",
      location: location,
      locationDisplay: locationDisplay,
      entity: normalized,
      enrichment: enrichment,
      score: null, // Set to null until qualification engine weights are bound
      priority: "UNQUALIFIED",
      reasons: [
        "Verified live corporate registration via Sunbiz.",
        "Canonical ledger entry generated and hash-bound."
      ],
      evidenceLedger: {
        inputSignalId: evidenceEntry.inputSignalId || null,
        sourceContentHash: evidenceEntry.sourceContentHash || evidenceEntry.contentHash || null,
        canonicalEntityHash: evidenceEntry.canonicalEntityHash || null,
        signalRecordHash: evidenceEntry.signalRecordHash || null
      }
    });
  }

  const primaryLead = leads[0];

  // Return full lead collection alongside primary root bindings for single-card UI support
  return {
    status: "success",
    count: leads.length,
    leads: leads,
    prospectName: primaryLead.prospectName,
    location: primaryLead.location,
    locationDisplay: primaryLead.locationDisplay,
    score: primaryLead.score,
    priority: primaryLead.priority,
    reasons: primaryLead.reasons,
    enrichment: primaryLead.enrichment,
    evidenceLedger: primaryLead.evidenceLedger
  };
}

module.exports = { runLeadPipeline };
