// /intent/SearchIntent.js

/**
 * SearchIntent
 *
 * Canonical structured representation of a user's
 * business-registry search intent.
 *
 * RESPONSIBILITY:
 * - Validate required search dimensions.
 * - Normalize industry and geography fields.
 * - Produce a stable contract for acquisition providers.
 *
 * DOES NOT:
 * - Interpret raw natural language.
 * - Perform registry searches.
 * - Determine whether a company is a qualified lead.
 * - Perform enrichment.
 */
function createSearchIntent({
  industry,
  geography,
  limit = 10
} = {}) {

  // ==========================================================================
  // INDUSTRY VALIDATION
  // ==========================================================================

  if (
    !industry ||
    typeof industry !== "object" ||
    Array.isArray(industry)
  ) {

    throw new Error(
      "SearchIntent requires an industry object."
    );
  }

  if (
    typeof industry.canonical !==
      "string" ||
    !industry.canonical.trim()
  ) {

    throw new Error(
      "SearchIntent requires an industry object with a valid canonical string."
    );
  }

  // ==========================================================================
  // GEOGRAPHY VALIDATION
  // ==========================================================================

  if (
    !geography ||
    typeof geography !== "object" ||
    Array.isArray(geography)
  ) {

    throw new Error(
      "SearchIntent requires a geography object."
    );
  }

  if (
    typeof geography.state !==
      "string" ||
    !geography.state.trim()
  ) {

    throw new Error(
      "SearchIntent requires a geography object with a valid state abbreviation."
    );
  }

  const state =
    geography.state
      .trim()
      .toUpperCase();

  /*
   * State/jurisdiction abbreviations are intentionally
   * represented as two-character codes.
   */
  if (
    !/^[A-Z]{2}$/.test(state)
  ) {

    throw new Error(
      `SearchIntent geography.state must be a two-letter jurisdiction code. Received: "${geography.state}".`
    );
  }

  // ==========================================================================
  // LIMIT NORMALIZATION
  // ==========================================================================

  const parsedLimit =
    Number.parseInt(
      limit,
      10
    );

  const normalizedLimit =
    Math.min(
      Math.max(
        Number.isFinite(parsedLimit)
          ? parsedLimit
          : 10,
        1
      ),
      50
    );

  // ==========================================================================
  // INDUSTRY NORMALIZATION
  // ==========================================================================

  const keywords =
    Array.isArray(
      industry.keywords
    )
      ? [
          ...new Set(
            industry.keywords
              .filter(
                keyword =>
                  typeof keyword ===
                  "string"
              )
              .map(
                keyword =>
                  keyword
                    .trim()
                    .toLowerCase()
              )
              .filter(Boolean)
          )
        ]
      : [];

  const classifications =
    Array.isArray(
      industry.classifications
    )
      ? [
          ...new Set(
            industry.classifications
              .filter(
                classification =>
                  typeof classification ===
                  "string"
              )
              .map(
                classification =>
                  classification.trim()
              )
              .filter(Boolean)
          )
        ]
      ]
      : [];

  // ==========================================================================
  // GEOGRAPHY NORMALIZATION
  // ==========================================================================

  const city =
    typeof geography.city ===
    "string"
      ? geography.city.trim() ||
        null
      : null;

  const county =
    typeof geography.county ===
    "string"
      ? geography.county.trim() ||
        null
      : null;

  const zip =
    typeof geography.zip ===
    "string" ||
    typeof geography.zip ===
    "number"
      ? String(
          geography.zip
        ).trim() || null
      : null;

  // ==========================================================================
  // CANONICAL SEARCH INTENT
  // ==========================================================================

  return {

    version:
      "1.0",

    industry: {

      canonical:
        industry.canonical
          .trim()
          .toLowerCase(),

      keywords,

      classifications
    },

    geography: {

      state,

      city,

      county,

      zip
    },

    limit:
      normalizedLimit
  };
}

module.exports = {
  createSearchIntent
};
