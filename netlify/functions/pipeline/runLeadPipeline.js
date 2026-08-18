const { SunbizProvider } = require("../providers/SunbizProvider");
const { EvidenceLedgerAdapter } = require("../ledger/EvidenceLedgerAdapter");
const { enrichProspect } = require("../enrichment/enrichProspect");
const { QualificationEngine } = require("../qualification/QualificationEngine");
const { buildUserPayload } = require("../prompts/leadQualifierPrompt");

/**
 * Core Lead Pipeline Execution Engine
 * Pure business logic called by both Firebase and Netlify adapters.
 *
 * @param {Object} params
 * @param {Object} [params.geoContext] - Geographic constraints (e.g., { states: ["FL"] })
 * @param {Object} [params.filters] - Query parameters (e.g., { industry: "Roofing" })
 * @returns {Promise<Object>} Unified pipeline output with leads payload and primary root bindings.
 */
async function runLeadPipeline({ geoContext, filters = {} }) {
  const provider = new SunbizProvider();
  const ledger = new EvidenceLedgerAdapter();

  const queryInput = filters.industry || "Roofing Contractors";
  const searchGeo = geoContext || { states: ["FL"] };

  // 1. Fetch raw registry candidate records
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
      evidenceSummary: ["Provider query yielded 0 candidate records."],
      qualificationReasons: [],
      enrichment: null,
      evidenceLedger: null
    };
  }

  const leads = [];

  // 2. Sequential/Controlled processing loop
  for (const raw of rawRecords) {
    const normalized = provider.normalize ? provider.normalize(raw) : raw;

    // Item 2: Delegate source reference resolution directly to the provider schema
    const sourceUrl = typeof provider.getSourceReference === "function"
      ? provider.getSourceReference(raw, normalized)
      : (normalized.docNumber || raw.cor_number || raw.docNumber || "https://search.sunbiz.org/");

    // Record observation in Evidence Ledger
    const evidenceEntry = ledger.recordObservation({
      providerName: provider.name || "SunbizProvider",
      rawPayload: raw,
      normalizedEntity: normalized,
      sourceUrl: sourceUrl,
      retrievedAt: new Date().toISOString()
    });

    // Item 3: Enforce strict deterministic identity. No timestamp fallbacks.
    if (!evidenceEntry || !evidenceEntry.inputSignalId) {
      throw new Error(
        `[PIPELINE INTEGRITY FAILURE] Evidence Ledger returned no inputSignalId for entity: ${normalized.companyName || 'Unknown Entity'}`
      );
    }

    // Item 4: Fault-Tolerant Enrichment Sandbox
    let enrichmentResult = {
      data: { website: null, contacts: null },
      status: "unattempted",
      errors: []
    };

    try {
      const enrichmentData = await enrichProspect(normalized);
      enrichmentResult = {
        data: enrichmentData,
        status: (enrichmentData.website || enrichmentData.contacts) ? "full" : "partial",
        errors: []
      };
    } catch (enrichError) {
      console.error(
        `[ENRICHMENT ERROR BOUNDARY] Non-fatal enrichment failure for ${normalized.companyName}:`,
        enrichError.message
      );
      enrichmentResult = {
        data: { website: null, contacts: null },
        status: "failed",
        errors: [{
          stage: "enrichProspect",
          message: enrichError.message
        }]
      };
    }

    // Construct Evidence Ledger record bindings
    const ledgerBinding = {
      inputSignalId: evidenceEntry.inputSignalId,
      sourceContentHash: evidenceEntry.sourceContentHash || evidenceEntry.contentHash || null,
      canonicalEntityHash: evidenceEntry.canonicalEntityHash || null,
      signalRecordHash: evidenceEntry.signalRecordHash || null,
      sourceUrl: sourceUrl
    };

    // Item 5: Execute Deterministic Qualification Engine
    const qualification = QualificationEngine.evaluate(
      normalized,
      enrichmentResult.data || {},
      ledgerBinding
    );

    // Item 6: Construct zero-trust AI user payload using object contract
    const aiUserPayload = buildUserPayload({
      canonicalEntity: normalized,
      enrichment: enrichmentResult.data,
      evidenceLedger: ledgerBinding,
      qualification: qualification
    });

    // Format location display string safely while preserving raw structured object
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
      prospectId: `prospect_${evidenceEntry.inputSignalId}`,
      prospectName: normalized.companyName || normalized.name || "Active Prospect",
      location: location,
      locationDisplay: locationDisplay,
      entity: normalized,
      enrichment: enrichmentResult,
      score: qualification.qualificationScore,
      priority: qualification.priority,
      evidenceSummary: qualification.evidence.map(e => e.message),
      qualificationReasons: qualification.qualificationReasons,
      salesSignals: qualification.salesSignals,
      recommendedAction: qualification.recommendedAction,
      aiUserPayload: aiUserPayload,
      evidenceLedger: ledgerBinding
    });
  }

  const primaryLead = leads[0];

  // Return full collection alongside primary root bindings for legacy/single-card UI compatibility
  return {
    status: "success",
    count: leads.length,
    leads: leads,
    prospectName: primaryLead.prospectName,
    location: primaryLead.location,
    locationDisplay: primaryLead.locationDisplay,
    score: primaryLead.score,
    priority: primaryLead.priority,
    evidenceSummary: primaryLead.evidenceSummary,
    qualificationReasons: primaryLead.qualificationReasons,
    enrichment: primaryLead.enrichment,
    evidenceLedger: primaryLead.evidenceLedger
  };
}

module.exports = { runLeadPipeline };
