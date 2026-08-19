const { SunbizProvider } =
  require("../providers/SunbizProvider");

const { EvidenceLedgerAdapter } =
  require("../ledger/EvidenceLedgerAdapter");

const { enrichProspect } =
  require("../enrichment/enrichProspect");

const { QualificationEngine } =
  require("../qualification/QualificationEngine");

const { IntentParser } =
  require("../intent/IntentParser");

/**
 * Core Lead Pipeline Execution Engine
 *
 * Runtime-agnostic business logic shared by Firebase and Netlify adapters.
 *
 * Pipeline:
 *
 *    Raw Search Request
 *        ↓
 *    Intent Parsing / Validation
 *        ↓
 *    Registry Search
 *        ↓
 *    Normalization
 *        ↓
 *    Evidence Ledger
 *        ↓
 *    Enrichment
 *        ↓
 *    Qualification
 *        ↓
 *    Structured Lead Output
 *
 * IMPORTANT:
 *
 * The AI prompt layer is intentionally NOT a hard dependency here.
 *
 * The deterministic pipeline must remain operational even if an optional
 * downstream AI module is unavailable.
 *
 * @param {Object} params
 * @param {Object} [params.geoContext]
 * @param {Object} [params.filters]
 * @returns {Promise<Object>}
 */
async function runLeadPipeline({
  geoContext,
  filters = {}
} = {}) {

  const provider =
    new SunbizProvider();

  const ledger =
    new EvidenceLedgerAdapter();

  const intentParser =
    new IntentParser();

  // ==========================================================================
  // 0. RAW SEARCH INPUT
  // ==========================================================================
  //
  // The pipeline accepts the existing transport contract:
  //
  // filters.industry
  // filters.query
  //
  // We preserve that contract so Firebase and Netlify do not need to change.
  // ==========================================================================

  const queryInput =
    String(
      filters.industry ||
      filters.query ||
      ""
    )
      .trim();

  const searchGeo =
    geoContext || {
      states: ["FL"]
    };

  // ==========================================================================
  // 1. SEARCH INTENT PARSING
  // ==========================================================================
  //
  // IntentParser validates and structures the human search request.
  //
  // Example:
  //
  // "solar contractors in Tampa FL"
  //
  // becomes approximately:
  //
  // {
  //   industry: {
  //     canonical: "solar contractor",
  //     keywords: [...],
  //     classifications: ["238210"]
  //   },
  //
  //   geography: {
  //     state: "FL",
  //     city: "Tampa",
  //     county: "Hillsborough",
  //     zip: null
  //   },
  //
  //   limit: 10
  // }
  //
  // IntentParser does NOT perform the registry search.
  // ==========================================================================

  let searchIntent;

  try {

    if (!queryInput) {

      throw new Error(
        "A search query is required."
      );
    }

    searchIntent =
      intentParser.parse(
        queryInput,
        {
          limit:
            filters.limit || 10
        }
      );

    console.log(
      "[PIPELINE SEARCH INTENT]",
      JSON.stringify(
        searchIntent,
        null,
        2
      )
    );

  } catch (intentError) {

    console.error(
      "[PIPELINE INTENT PARSE FAILURE]",
      {
        message:
          intentError.message,

        query:
          queryInput
      }
    );

    return {

      status:
        "invalid_intent",

      providerStatus:
        "not_attempted",

      errorType:
        "INTENT_PARSE_ERROR",

      httpStatus:
        null,

      count:
        0,

      leads:
        [],

      prospectName:
        `Unable to interpret search "${queryInput}"`,

      location: {
        state:
          searchGeo?.states?.[0] ||
          "FL"
      },

      locationDisplay:
        searchGeo?.city
          ? `${searchGeo.city}, ${searchGeo?.states?.[0] || "FL"}`
          : (
              searchGeo?.states?.[0] ||
              "FL"
            ),

      score:
        null,

      priority:
        "UNQUALIFIED",

      evidenceSummary: [
        intentError.message
      ],

      qualificationReasons: [],

      salesSignals: [],

      recommendedAction:
        "Use a supported industry and Florida geographic location.",

      enrichment:
        null,

      evidenceLedger:
        null
    };
  }

  // ==========================================================================
  // 1A. RESOLVE SEARCH GEOGRAPHY
  // ==========================================================================
  //
  // IntentParser has authoritative knowledge of supported Florida geography.
  //
  // We use the parsed geography when available, while preserving the original
  // transport geoContext as a fallback.
  //
  // IMPORTANT:
  //
  // This does NOT claim that Sunbiz returned the company from this location.
  // The provider remains responsible for actual registry observations.
  // ==========================================================================

  const parsedGeography =
    searchIntent?.geography || null;

  const resolvedGeoContext = {

    ...searchGeo,

    ...(parsedGeography
      ? {
          state:
            parsedGeography.state,

          city:
            parsedGeography.city,

          county:
            parsedGeography.county,

          zip:
            parsedGeography.zip
        }
      : {}),

    states:
      parsedGeography?.state
        ? [parsedGeography.state]
        : (
            Array.isArray(
              searchGeo?.states
            )
              ? searchGeo.states
              : ["FL"]
          )
  };

  // ==========================================================================
  // 1B. BUILD PROVIDER FILTERS
  // ==========================================================================
  //
  // CRITICAL:
  //
  // SunbizProvider.search() expects:
  //
  //     search(geoContext, filters)
  //
  // It does NOT expect a SearchIntent as its first argument.
  //
  // Therefore we translate the validated SearchIntent back into the provider
  // contract here.
  //
  // The raw query is preserved because SunbizProvider currently performs a
  // ByName search using filters.query / filters.industry.
  // ==========================================================================

  const providerFilters = {

    ...filters,

    query:
      queryInput,

    industry:
      queryInput,

    limit:
      searchIntent?.limit ||
      filters.limit ||
      10,

    classifications:
      searchIntent?.industry?.classifications ||
      [],

    canonicalIndustry:
      searchIntent?.industry?.canonical ||
      null
  };

  console.log(
    "[PIPELINE PROVIDER REQUEST]",
    {
      provider:
        provider.name,

      query:
        providerFilters.query,

      canonicalIndustry:
        providerFilters.canonicalIndustry,

      classifications:
        providerFilters.classifications,

      geography:
        resolvedGeoContext,

      limit:
        providerFilters.limit
    }
  );

  // ==========================================================================
  // 2. REGISTRY SEARCH
  // ==========================================================================

  let searchResult;

  try {

    searchResult =
      await provider.search(
        resolvedGeoContext,
        providerFilters
      );

  } catch (searchError) {

    console.error(
      `[PIPELINE SEARCH FAILURE] ${provider.name || "SunbizProvider"}:`,
      searchError.message
    );

    searchResult = {

      providerStatus:
        "unavailable",

      provider:
        provider.name ||
        "SunbizProvider",

      httpStatus:
        null,

      records:
        [],

      errorType:
        searchError?.name ||
        "PIPELINE_SEARCH_EXCEPTION"
    };
  }

  // ==========================================================================
  // 2A. PROVIDER UNAVAILABLE CONTRACT GUARD
  // ==========================================================================

  if (
    searchResult?.providerStatus ===
    "unavailable"
  ) {

    console.warn(
      `[PIPELINE] Provider ${provider.name} is currently unavailable. ErrorType: ${searchResult.errorType}`
    );

    return {

      status:
        "unavailable",

      providerStatus:
        "unavailable",

      errorType:
        searchResult.errorType ||
        "HTTP_ERROR",

      httpStatus:
        searchResult.httpStatus ||
        null,

      count:
        0,

      leads:
        [],

      prospectName:
        `State registry search is temporarily unavailable for "${queryInput}"`,

      location: {
        state:
          resolvedGeoContext?.states?.[0] ||
          "FL",

        city:
          resolvedGeoContext?.city ||
          null,

        county:
          resolvedGeoContext?.county ||
          null
      },

      locationDisplay:
        resolvedGeoContext?.city
          ? `${resolvedGeoContext.city}, ${resolvedGeoContext?.states?.[0] || "FL"}`
          : (
              resolvedGeoContext?.states?.[0] ||
              "FL"
            ),

      score:
        null,

      priority:
        "UNQUALIFIED",

      evidenceSummary: [
        `State registry provider (${provider.name}) returned status: unavailable (${searchResult.errorType || "HTTP_ERROR"}).`
      ],

      qualificationReasons: [],

      salesSignals: [],

      recommendedAction:
        "Retry search after registry service recovers.",

      enrichment:
        null,

      evidenceLedger:
        null
    };
  }

  // ==========================================================================
  // 2B. NORMALIZE PROVIDER RESPONSE
  // ==========================================================================

  const rawRecords =
    Array.isArray(
      searchResult?.records
    )
      ? searchResult.records
      : Array.isArray(
          searchResult
        )
          ? searchResult
          : [];

  // ==========================================================================
  // 3. EMPTY RESULT CONTRACT
  // ==========================================================================

  if (
    rawRecords.length ===
    0
  ) {

    return {

      status:
        "empty",

      providerStatus:
        searchResult?.providerStatus ||
        "success",

      count:
        0,

      leads:
        [],

      prospectName:
        `No live registry records found for "${queryInput}"`,

      location: {
        state:
          resolvedGeoContext?.states?.[0] ||
          "FL",

        city:
          resolvedGeoContext?.city ||
          null,

        county:
          resolvedGeoContext?.county ||
          null
      },

      locationDisplay:
        resolvedGeoContext?.city
          ? `${resolvedGeoContext.city}, ${resolvedGeoContext?.states?.[0] || "FL"}`
          : (
              resolvedGeoContext?.states?.[0] ||
              "FL"
            ),

      score:
        null,

      priority:
        "UNQUALIFIED",

      evidenceSummary: [
        "Provider query yielded 0 candidate records."
      ],

      qualificationReasons: [],

      salesSignals: [],

      recommendedAction:
        null,

      enrichment:
        null,

      evidenceLedger:
        null
    };
  }

  const leads = [];

  // ==========================================================================
  // 4. SEQUENTIAL CANDIDATE PROCESSING
  //
  // Intentionally sequential.
  //
  // Do NOT replace with Promise.all().
  //
  // Registry + website + contact enrichment can generate external traffic.
  // Sequential execution limits sudden outbound request bursts.
  // ==========================================================================

  for (
    const raw of rawRecords
  ) {

    // ------------------------------------------------------------------------
    // 4A. NORMALIZE REGISTRY RECORD
    // ------------------------------------------------------------------------

    let normalized;

    try {

      normalized =
        typeof provider.normalize ===
        "function"
          ? provider.normalize(
              raw
            )
          : raw;

    } catch (
      normalizeError
    ) {

      console.error(
        `[NORMALIZATION FAILURE] ${normalizeError.message}`
      );

      continue;
    }

    if (
      !normalized ||
      !normalized.companyName
    ) {

      console.warn(
        "[PIPELINE] Skipping candidate with no canonical company name."
      );

      continue;
    }

    // ------------------------------------------------------------------------
    // 4B. RESOLVE AUTHORITATIVE SOURCE URL
    // ------------------------------------------------------------------------

    let sourceUrl =
      "https://search.sunbiz.org/";

    try {

      if (
        typeof provider.getSourceReference ===
        "function"
      ) {

        sourceUrl =
          provider.getSourceReference(
            raw,
            normalized
          );
      }

    } catch (
      sourceError
    ) {

      console.warn(
        `[SOURCE REFERENCE WARNING] ${normalized.companyName}:`,
        sourceError.message
      );
    }

    // ------------------------------------------------------------------------
    // 4C. RECORD EVIDENCE
    // ------------------------------------------------------------------------

    let evidenceEntry;

    try {

      evidenceEntry =
        ledger.recordObservation({

          providerName:
            provider.name ||
            "SunbizProvider",

          rawPayload:
            raw,

          normalizedEntity:
            normalized,

          sourceUrl:
            sourceUrl,

          retrievedAt:
            new Date().toISOString()
        });

    } catch (
      ledgerError
    ) {

      console.error(
        `[LEDGER FAILURE] ${normalized.companyName}:`,
        ledgerError.message
      );

      throw new Error(
        `Evidence Ledger failure for ${normalized.companyName}: ${ledgerError.message}`
      );
    }

    // ------------------------------------------------------------------------
    // 4D. STRICT LEDGER IDENTITY REQUIREMENT
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
    // 4E. CONSTRUCT LEDGER BINDING
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
    // 5. ENRICHMENT
    // ==========================================================================

    let enrichmentResult = {

      data: {

        website:
          null,

        businessPhone:
          null,

        emails:
          [],

        phones:
          [],

        digitalSignals:
          [],

        contacts:
          [],

        status:
          "unavailable",

        errors:
          []
      },

      status:
        "unattempted",

      errors:
        []
    };

    try {

      const enrichmentData =
        await enrichProspect(
          normalized
        );

      const websiteData =
        enrichmentData?.website ||
        null;

      const contactData =
        enrichmentData?.contacts ||
        null;

      const websiteEmails =
        Array.isArray(
          websiteData?.emails
        )
          ? websiteData.emails
          : [];

      const websitePhones =
        Array.isArray(
          websiteData?.phones
        )
          ? websiteData.phones
          : [];

      const websiteSignals =
        Array.isArray(
          websiteData?.digitalSignals
        )
          ? websiteData.digitalSignals
          : [];

      const contactEmails =
        Array.isArray(
          contactData?.emails
        )
          ? contactData.emails
          : Array.isArray(
              contactData?.publicEmails
            )
              ? contactData.publicEmails.map(
                  value => ({
                    value,
                    source:
                      "contact_search",
                    confidence:
                      "low",
                    verified:
                      false
                  })
                )
              : [];

      const contactPhones =
        Array.isArray(
          contactData?.phones
        )
          ? contactData.phones
          : contactData?.primaryPhone
            ? [
                {
                  value:
                    contactData.primaryPhone,

                  source:
                    "contact_search",

                  confidence:
                    contactData.sourceConfidence ||
                    "low"
                }
              ]
            : [];

      const normalizedEnrichmentData = {

        website:
          websiteData,

        contacts:
          contactData,

        emails: [
          ...websiteEmails,
          ...contactEmails
        ],

        phones: [
          ...websitePhones,
          ...contactPhones
        ],

        digitalSignals:
          websiteSignals,

        observations: [

          ...(websiteData
            ? [
                {
                  provider:
                    "WebsiteReconProvider",

                  observedAt:
                    websiteData.observedAt ||
                    new Date().toISOString(),

                  observationType:
                    "website_reconnaissance"
                }
              ]
            : []),

          ...(contactData
            ? [
                {
                  provider:
                    "ContactSearch",

                  observedAt:
                    contactData.searchedAt ||
                    new Date().toISOString(),

                  observationType:
                    "contact_enrichment"
                }
              ]
            : [])
        ]
      };

      const hasWebsiteData =
        Boolean(
          websiteData &&
          websiteData.status ===
            "success"
        );

      const hasContactData =
        Boolean(
          contactData &&
          (
            contactData.primaryPhone ||
            contactData.publicEmails?.length ||
            contactData.emails?.length ||
            contactData.phones?.length
          )
        );

      const hasFlattenedObservations =
        normalizedEnrichmentData.emails.length >
          0 ||
        normalizedEnrichmentData.phones.length >
          0 ||
        normalizedEnrichmentData.digitalSignals.length >
          0;

      enrichmentResult = {

        data:
          normalizedEnrichmentData,

        status:
          hasWebsiteData ||
          hasContactData ||
          hasFlattenedObservations
            ? "complete"
            : "empty",

        errors:
          []
      };

    } catch (
      enrichError
    ) {

      console.error(
        `[ENRICHMENT ERROR BOUNDARY] ${normalized.companyName}:`,
        enrichError.message
      );

      enrichmentResult = {

        data: {

          website:
            null,

          businessPhone:
            null,

          emails:
            [],

          phones:
            [],

          digitalSignals:
            [],

          contacts:
            [],

          status:
            "failed",

          errors: [
            {
              stage:
                "enrichProspect",

              message:
                enrichError.message
            }
          ]
        },

        status:
          "failed",

        errors: [
          {
            stage:
              "enrichProspect",

            message:
              enrichError.message
          }
        ]
      };
    }

    // ==========================================================================
    // 6. DETERMINISTIC QUALIFICATION
    // ==========================================================================

    let qualification;

    try {

      qualification =
        QualificationEngine.evaluate(

          normalized,

          enrichmentResult.data ||
            {},

          ledgerBinding
        );

    } catch (
      qualificationError
    ) {

      console.error(
        `[QUALIFICATION FAILURE] ${normalized.companyName}:`,
        qualificationError.message
      );

      qualification = {

        qualificationScore:
          null,

        priority:
          "UNQUALIFIED",

        qualificationReasons: [
          "Qualification engine failed; manual review required."
        ],

        salesSignals: [
          {
            code:
              "QUALIFICATION_ENGINE_ERROR",

            message:
              qualificationError.message
          }
        ],

        recommendedAction:
          "Perform manual qualification review.",

        evaluatedAt:
          new Date().toISOString()
      };
    }

    // ==========================================================================
    // 7. LOCATION NORMALIZATION
    // ==========================================================================

    const location =
      normalized.location ||
      {};

    let locationDisplay =
      "Florida";

    if (
      typeof location ===
      "string"
    ) {

      locationDisplay =
        location;

    } else if (
      location &&
      typeof location ===
      "object"
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
    // 8. EVIDENCE SUMMARY
    // ==========================================================================

    const evidenceSummary = [

      "Verified registry observation processed through the active provider.",

      "Canonical observation ledger entry generated and hash-bound."
    ];

    if (
      sourceUrl
    ) {

      evidenceSummary.push(
        `Authoritative source: ${sourceUrl}`
      );
    }

    if (
      enrichmentResult.status ===
      "complete"
    ) {

      evidenceSummary.push(
        "Secondary public enrichment observations collected."
      );
    }

    // ==========================================================================
    // 9. STRUCTURED LEAD OBJECT
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
        qualification.qualificationScore ??
        null,

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
  // 10. SAFETY CHECK
  // ==========================================================================

  if (
    leads.length ===
    0
  ) {

    return {

      status:
        "empty",

      count:
        0,

      leads:
        [],

      prospectName:
        `No valid lead records could be constructed for "${queryInput}"`,

      location: {
        state:
          resolvedGeoContext?.states?.[0] ||
          "FL",

        city:
          resolvedGeoContext?.city ||
          null,

        county:
          resolvedGeoContext?.county ||
          null
      },

      locationDisplay:
        resolvedGeoContext?.city
          ? `${resolvedGeoContext.city}, ${resolvedGeoContext?.states?.[0] || "FL"}`
          : (
              resolvedGeoContext?.states?.[0] ||
              "FL"
            ),

      score:
        null,

      priority:
        "UNQUALIFIED",

      evidenceSummary: [
        "Provider returned records, but none passed pipeline integrity checks."
      ],

      qualificationReasons: [],

      salesSignals: [],

      recommendedAction:
        null,

      enrichment:
        null,

      evidenceLedger:
        null
    };
  }

  // ==========================================================================
  // 11. PRIMARY LEAD / LEGACY ROOT BINDINGS
  // ==========================================================================

  const primaryLead =
    leads[0];

  return {

    status:
      "success",

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
```
