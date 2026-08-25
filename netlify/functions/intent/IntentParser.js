const { createSearchIntent } = require("./SearchIntent.js");

/**
 * IntentParser
 *
 * Converts raw human registry-search language into a structured
 * SearchIntent.
 *
 * RESPONSIBILITY:
 * - Parse industry terminology.
 * - Parse supported geographic terminology.
 * - Resolve known industry aliases.
 * - Resolve known Florida cities/counties.
 * - Produce a validated SearchIntent.
 *
 * DOES NOT:
 * - Search the registry.
 * - Query external APIs.
 * - Validate whether a company is geographically qualified.
 * - Determine whether a company is a good prospect.
 * - Perform enrichment.
 * - Score leads.
 * - Write to the Evidence Ledger.
 */
class IntentParser {

  constructor() {

    this.name =
      "IntentParser";

    // ------------------------------------------------------------------------
    // INDUSTRY VOCABULARY
    //
    // This is intentionally explicit and deterministic.
    // Expand this registry as RyGuyLabs adds industries.
    // ------------------------------------------------------------------------

    this.industryDefinitions = [

      {
        canonical:
          "solar contractor",

        keywords: [
          "solar",
          "solar contractor",
          "solar contractors",
          "solar installation",
          "solar installer",
          "solar installers",
          "solar energy",
          "photovoltaic",
          "photovoltaic contractor",
          "pv contractor",
          "pv installer"
        ],

        classifications: [
          "238210"
        ]
      },

      {
        canonical:
          "electrical contractor",

        keywords: [
          "electrician",
          "electricians",
          "electrical contractor",
          "electrical contractors",
          "electrical company",
          "electrical companies",
          "electric contractor"
        ],

        classifications: [
          "238210"
        ]
      },

      {
        canonical:
          "plumbing contractor",

        keywords: [
          "plumber",
          "plumbers",
          "plumbing",
          "plumbing contractor",
          "plumbing contractors",
          "plumbing company",
          "plumbing companies"
        ],

        classifications: [
          "238220"
        ]
      },

      {
        canonical:
          "hvac contractor",

        keywords: [
          "hvac",
          "hvac contractor",
          "hvac contractors",
          "air conditioning contractor",
          "ac contractor",
          "heating contractor",
          "cooling contractor"
        ],

        classifications: [
          "238220"
        ]
      }

    ];

    // ------------------------------------------------------------------------
    // COMMON FLORIDA CITY / COUNTY RESOLUTION
    //
    // This can later move into a dedicated geography dictionary.
    // ------------------------------------------------------------------------

    this.floridaGeographies = {

      tampa: {
        city:
          "Tampa",

        county:
          "Hillsborough",

        state:
          "FL"
      },

      "st. petersburg": {
        city:
          "St. Petersburg",

        county:
          "Pinellas",

        state:
          "FL"
      },

      "st petersburg": {
        city:
          "St. Petersburg",

        county:
          "Pinellas",

        state:
          "FL"
      },

      orlando: {
        city:
          "Orlando",

        county:
          "Orange",

        state:
          "FL"
      },

      miami: {
        city:
          "Miami",

        county:
          "Miami-Dade",

        state:
          "FL"
      },

      jacksonville: {
        city:
          "Jacksonville",

        county:
          "Duval",

        state:
          "FL"
      },

      tallahassee: {
        city:
          "Tallahassee",

        county:
          "Leon",

        state:
          "FL"
      },

      fort_lauderdale: {
        city:
          "Fort Lauderdale",

        county:
          "Broward",

        state:
          "FL"
      }

    };
  }

  /**
   * Parse raw user search language.
   *
   * @param {string} input
   * @param {Object} options
   * @returns {Object} SearchIntent
   */
  parse(input, options = {}) {

    if (
      typeof input !== "string" ||
      !input.trim()
    ) {

      throw new Error(
        "IntentParser requires a non-empty search string."
      );
    }

    const rawInput =
      input
        .replace(/\s+/g, " ")
        .trim();

    const normalizedInput =
      rawInput
        .toLowerCase();

   // ------------------------------------------------------------------------
// INDUSTRY
// ------------------------------------------------------------------------

let industry =
  this.resolveIndustry(
    normalizedInput
  );

if (!industry) {

  const industryQuery =
    this.extractIndustryQuery(
      normalizedInput
    );

  if (!industryQuery) {

    throw new Error(
      `Unable to determine an industry concept from search: "${rawInput}".`
    );
  }

  industry = {
    canonical:
      industryQuery,

    keywords: [
      industryQuery
    ],

    classifications: []
  };
}
    // ------------------------------------------------------------------------
    // GEOGRAPHY
    // ------------------------------------------------------------------------

    const geography =
      this.resolveGeography(
        normalizedInput
      );

    if (!geography) {

      throw new Error(
        `Unable to determine search geography from: "${rawInput}".`
      );
    }

    // ------------------------------------------------------------------------
    // LIMIT
    // ------------------------------------------------------------------------

    const limit =
      options.limit !== undefined
        ? options.limit
        : 10;

    // ------------------------------------------------------------------------
    // CREATE VALIDATED SEARCH INTENT
    // ------------------------------------------------------------------------

    return createSearchIntent({

      industry,

      geography,

      limit

    });
  }

  /**
   * Resolve industry vocabulary.
   */
  resolveIndustry(
  normalizedInput,
  rawInput = normalizedInput
) {

  // ------------------------------------------------------------------------
  // KNOWN INDUSTRY MATCH
  //
  // Known vocabulary provides enhanced metadata, but it is NOT a hard gate.
  // ------------------------------------------------------------------------

  for (
    const definition of
      this.industryDefinitions
  ) {

    const matched =
      definition.keywords.some(
        keyword =>
          normalizedInput.includes(
            keyword.toLowerCase()
          )
      );

    if (matched) {

      return {
        canonical:
          definition.canonical,

        keywords:
          definition.keywords,

        classifications:
          definition.classifications,

        resolution:
          "known"
      };
    }
  }

  // ------------------------------------------------------------------------
  // OPEN-ENDED INDUSTRY FALLBACK
  //
  // Preserve legitimate user-supplied industry terminology even when that
  // industry has not yet been added to the deterministic vocabulary.
  //
  // Do NOT invent classifications here.
  // ------------------------------------------------------------------------

  const geographyTerms = [
    ...Object.keys(
      this.floridaGeographies
    ),
    ...Object.values(
      this.floridaGeographies
    )
      .map(
        geography =>
          geography.city.toLowerCase()
      ),
    "florida",
    "fl"
  ];

  let industryText =
    String(rawInput)
      .toLowerCase();

  for (
    const term of geographyTerms
  ) {

    industryText =
      industryText.replace(
        new RegExp(
          `\\b${term.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          )}\\b`,
          "gi"
        ),
        " "
      );
  }

  industryText =
    industryText
      .replace(
        /\s+/g,
        " "
      )
      .trim();

  if (!industryText) {
    return null;
  }

  return {
    canonical:
      industryText,

    keywords: [
      industryText
    ],

    classifications: [],

    resolution:
      "user_defined"
  };
}
  // ------------------------------------------------------------------------
  // FALLBACK: Preserve a plausible user-supplied industry concept.
  //
  // The IntentParser must not use the small deterministic vocabulary
  // above as a hard gate for the entire lead-generation platform.
  //
  // Industry expansion / relevance logic can enrich this concept later.
  // ------------------------------------------------------------------------

  const geographyTerms = [
    ...Object.keys(this.floridaGeographies),
    ...Object.values(this.floridaGeographies)
      .map(geo => geo.city.toLowerCase()),
    "florida",
    "fl"
  ];

  let industryText =
    normalizedInput;

  for (const term of geographyTerms) {

    industryText =
      industryText.replace(
        new RegExp(
          `\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
          "gi"
        ),
        " "
      );
  }

  industryText =
    industryText
      .replace(/\s+/g, " ")
      .trim();

  if (!industryText) {
    return null;
  }

  return {
    canonical:
      industryText,

    keywords: [
      industryText
    ],

    classifications: []
  };
}

  /**
   * Resolve geography.
   */
  resolveGeography(
    normalizedInput
  ) {

    // ------------------------------------------------------------------------
    // CITY NAME MATCH
    // ------------------------------------------------------------------------

    for (
      const key of
        Object.keys(
          this.floridaGeographies
        )
    ) {

      const geography =
        this.floridaGeographies[key];

      const city =
        geography.city
          .toLowerCase();

      if (
        normalizedInput.includes(
          city
        ) ||
        normalizedInput.includes(
          key.replace(
            /_/g,
            " "
          )
        )
      ) {

        return {
          state:
            geography.state,

          city:
            geography.city,

          county:
            geography.county,

          zip:
            null
        };
      }
    }

    // ------------------------------------------------------------------------
    // STATE-ONLY SEARCH
    // ------------------------------------------------------------------------

    if (
      /\bfl\b/.test(
        normalizedInput
      ) ||
      /\bflorida\b/.test(
        normalizedInput
      )
    ) {

      return {
        state:
          "FL",

        city:
          null,

        county:
          null,

        zip:
          null
      };
    }

    return null;
  }
}

module.exports = {
  IntentParser
};
