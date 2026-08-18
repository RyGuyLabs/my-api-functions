const { SunbizProvider } = require("../providers/SunbizProvider");
const { EvidenceLedgerAdapter } = require("../ledger/EvidenceLedgerAdapter");
const { enrichProspect } = require("../enrichment/enrichProspect");
const { QualificationEngine } = require("../qualification/QualificationEngine");

/**
 * Core Lead Pipeline Execution Engine
 *
 * Runtime-agnostic business logic shared by Firebase and Netlify adapters.
 *
 * Pipeline:
 *   Registry Search
 *      ↓
 *   Normalization
 *      ↓
 *   Evidence Ledger
 *      ↓
 *   Enrichment
 *      ↓
 *   Qualification
 *      ↓
 *   Structured Lead Output
 *
 * IMPORTANT:
 * The AI prompt layer is intentionally NOT a hard dependency here.
 * The core lead pipeline must remain operational even if an optional
 * downstream AI module is unavailable.
 *
 * @param {Object} params
 * @param {Object} [params.geoContext]
 * @param {Object} [params.filters]
 * @returns {Promise<Object>}
 */
async function runLeadPipeline({ geoContext, filters = {} }) {
  const provider = new SunbizProvider();
  const ledger = new EvidenceLedgerAdapter();

  const queryInput =
    filters.industry ||
    filters.query ||
    "Roofing Contractors";

  const searchGeo =
    geoContext || {
      states: ["FL"]
    };

  // ==========================================================================
  // 1. REGISTRY SEARCH
  // ==========================================================================

  let rawRecords;

  try {
    rawRecords = await provider.search(
      searchGeo,
      {
        ...filters,
        industry: queryInput
      }
    );
  } catch (searchError) {
    console.error(
      `[PIPELINE SEARCH FAILURE] ${provider.name}:`,
      searchError.message
    );

    throw new Error(
      `Lead registry search failed: ${searchError.message}`
    );
  }

  // ==========================================================================
  // 2. EMPTY RESULT CONTRACT
  // ==========================================================================

  if (!Array.isArray(rawRecords) || rawRecords.length === 0) {
    return {
      status: "empty",
      count: 0,
      leads: [],
      prospectName:
        `No live registry records found for "${queryInput}"`,
      location: {
        state: searchGeo?.states?.[0] || "FL"
      },
      locationDisplay:
        searchGeo?.city
          ? `${searchGeo.city}, ${searchGeo?.states?.[0] || "FL"}`
          : (searchGeo?.states?.[0] || "FL"),
      score: null,
      priority: "UNQUALIFIED",
      evidenceSummary: [
        "Provider query yielded 0 candidate records."
      ],
      qualificationReasons: [],
      salesSignals: [],
      recommendedAction: null,
      enrichment: null,
      evidenceLedger: null
    };
  }

  const leads = [];

  // ==========================================================================
  // 3. SEQUENTIAL CANDIDATE PROCESSING
  //
  // Intentionally sequential.
  // Do NOT replace this with Promise.all().
  //
  // Registry + website + contact enrichment can generate external traffic.
  // Sequential processing prevents a sudden burst of requests against
  // third-party services.
  // ==========================================================================

  for (const raw of rawRecords) {
    // ------------------------------------------------------------------------
    // 3A. NORMALIZE REGISTRY RECORD
    // ------------------------------------------------------------------------

    let normalized;

    try {
      normalized =
        typeof provider.normalize === "function"
          ? provider.normalize(raw)
          : raw;
    } catch (normalizeError) {
      console.error(
        `[NORMALIZATION FAILURE]`,
        normalizeError.message
      );

      // One malformed provider record should not destroy the entire batch.
      continue;
    }

    if (!normalized || !normalized.companyName) {
      console.warn(
        "[PIPELINE] Skipping candidate with no canonical company name."
      );
      continue;
    }

    // ------------------------------------------------------------------------
    // 3B. RESOLVE AUTHORITATIVE SOURCE URL
    // ------------------------------------------------------------------------

    let sourceUrl =
      "https://search.sunbiz.org/";

    try {
      if (
        typeof provider.getSourceReference === "function"
      ) {
        sourceUrl =
          provider.getSourceReference(
            raw,
            normalized
          );
      }
    } catch (sourceError) {
      console.warn(
        `[SOURCE REFERENCE WARNING] ${normalized.companyName}:`,
        sourceError.message
      );
    }

    // ------------------------------------------------------------------------
    // 3C. RECORD EVIDENCE
    // ------------------------------------------------------------------------

    let evidenceEntry;

    try {
      evidenceEntry = ledger.recordObservation({
        providerName:
          provider.name || "SunbizProvider",

        rawPayload: raw,

        normalizedEntity: normalized,

        sourceUrl: sourceUrl,

        retrievedAt:
          new Date().toISOString()
      });
    } catch (ledgerError) {
      console.error(
        `[LEDGER FAILURE] ${normalized.companyName}:`,
        ledgerError.message
      );

      throw new Error(
        `Evidence Ledger failure for ${normalized.companyName}: ${ledgerError.message}`
      );
    }

    // ------------------------------------------------------------------------
    // 3D. STRICT LEDGER IDENTITY REQUIREMENT
    // ------------------------------------------------------------------------

    if (
      !evidenceEntry ||
      !evidenceEntry.inputSignalId
    ) {
      throw new Error(
        `[PIPELINE INTEGRITY FAILURE] Evidence Ledger returned no inputSignalId for entity: ${normalized.companyName}`
      );
    }

    // ------------------------------------------------------------------------
    // 3E. CONSTRUCT LEDGER BINDING
    // ------------------------------------------------------------------------

    const ledgerBinding = {
      inputSignalId:
        evidenceEntry.inputSignalId,

      sourceContentHash:
        evidenceEntry.sourceContentHash ||
        evidenceEntry.contentHash ||
        null,

      canonicalEntityHash:
        evidenceEntry.canonicalEntityHash ||
        null,

      signalRecordHash:
        evidenceEntry.signalRecordHash ||
        null,

      sourceUrl:
        sourceUrl
    };

    // ==========================================================================
    // 4. ENRICHMENT
    // ==========================================================================

    let enrichmentResult = {
      data: {
        website: null,
        contacts: null
      },
      status: "unattempted",
      errors: []
    };

    try {
      const enrichmentData =
        await enrichProspect(normalized);

      const hasWebsiteData =
        Boolean(enrichmentData?.website);

      const hasContactData =
        Boolean(enrichmentData?.contacts);

      enrichmentResult = {
        data: enrichmentData,

        status:
          hasWebsiteData || hasContactData
            ? "partial"
            : "empty",

        errors: []
      };
    } catch (enrichError) {
      console.error(
        `[ENRICHMENT ERROR BOUNDARY] ${normalized.companyName}:`,
        enrichError.message
      );

      enrichmentResult = {
        data: {
          website: null,
          contacts: null
        },

        status: "failed",

        errors: [
          {
            stage: "enrichProspect",
            message: enrichError.message
          }
        ]
      };
    }

    // ==========================================================================
    // 5. DETERMINISTIC QUALIFICATION
    // ==========================================================================

    let qualification;

    try {
      qualification =
        QualificationEngine.evaluate(
          normalized,
          enrichmentResult.data || {},
          ledgerBinding
        );
    } catch (qualificationError) {
      console.error(
        `[QUALIFICATION FAILURE] ${normalized.companyName}:`,
        qualificationError.message
      );

      // Qualification failure should not destroy verified registry data.
      qualification = {
        qualificationScore: null,

        priority: "UNQUALIFIED",

        qualificationReasons: [
          "Qualification engine failed; manual review required."
        ],

        salesSignals: [
          {
            code: "QUALIFICATION_ENGINE_ERROR",
            message: qualificationError.message
          }
        ],

        recommendedAction:
          "Perform manual qualification review.",

        evaluatedAt:
          new Date().toISOString()
      };
    }

    // ==========================================================================
    // 6. LOCATION NORMALIZATION
    // ==========================================================================

    const location =
      normalized.location || {};

    let locationDisplay =
      "Florida";

    if (typeof location === "string") {
      locationDisplay =
        location;
    } else if (
      location &&
      typeof location === "object"
    ) {
      locationDisplay =
        [
          location.city,
          location.state,
          location.zip
        ]
          .filter(Boolean)
          .join(", ") ||
        "Florida";
    }

    // ==========================================================================
    // 7. EVIDENCE SUMMARY
    //
    // Do NOT assume QualificationEngine.evidence exists.
    // The current engine exposes qualificationReasons and salesSignals.
    // ==========================================================================

    const evidenceSummary = [
      "Verified registry observation processed through the active provider.",

      "Canonical observation ledger entry generated and hash-bound."
    ];

    if (sourceUrl) {
      evidenceSummary.push(
        `Authoritative source: ${sourceUrl}`
      );
    }

    // ==========================================================================
    // 8. STRUCTURED LEAD OBJECT
    // ==========================================================================

    leads.push({
      prospectId:
        `prospect_${evidenceEntry.inputSignalId}`,

      prospectName:
        normalized.companyName ||
        normalized.name ||
        "Active Prospect",

      location:
        location,

      locationDisplay:
        locationDisplay,

      entity:
        normalized,

      enrichment:
        enrichmentResult,

      score:
        qualification.qualificationScore ?? null,

      priority:
        qualification.priority ||
        "UNQUALIFIED",

      qualificationReasons:
        Array.isArray(
          qualification.qualificationReasons
        )
          ? qualification.qualificationReasons
          : [],

      salesSignals:
        Array.isArray(
          qualification.salesSignals
        )
          ? qualification.salesSignals
          : [],

      recommendedAction:
        qualification.recommendedAction ||
        null,

      evidenceSummary:
        evidenceSummary,

      evidenceLedger:
        ledgerBinding
    });
  }

  // ==========================================================================
  // 9. SAFETY CHECK
  // ==========================================================================

  if (leads.length === 0) {
    return {
      status: "empty",
      count: 0,
      leads: [],
      prospectName:
        `No valid lead records could be constructed for "${queryInput}"`,
      location: {
        state:
          searchGeo?.states?.[0] || "FL"
      },
      locationDisplay:
        searchGeo?.city
          ? `${searchGeo.city}, ${searchGeo?.states?.[0] || "FL"}`
          : (searchGeo?.states?.[0] || "FL"),
      score: null,
      priority: "UNQUALIFIED",
      evidenceSummary: [
        "Provider returned records, but none passed pipeline integrity checks."
      ],
      qualificationReasons: [],
      salesSignals: [],
      recommendedAction: null,
      enrichment: null,
      evidenceLedger: null
    };
  }

  // ==========================================================================
  // 10. PRIMARY LEAD / LEGACY ROOT BINDINGS
  // ==========================================================================

  const primaryLead =
    leads[0];

  return {
    status: "success",

    count:
      leads.length,

    leads:
      leads,

    // Legacy / single-card compatibility
    prospectName:
      primaryLead.prospectName,

    location:
      primaryLead.location,

    locationDisplay:
      primaryLead.locationDisplay,

    score:
      primaryLead.score,

    priority:
      primaryLead.priority,

    recommendedAction:
      primaryLead.recommendedAction,

    evidenceSummary:
      primaryLead.evidenceSummary,

    qualificationReasons:
      primaryLead.qualificationReasons,

    salesSignals:
      primaryLead.salesSignals,

    enrichment:
      primaryLead.enrichment,

    evidenceLedger:
      primaryLead.evidenceLedger
  };
}

module.exports = {
  runLeadPipeline
};
