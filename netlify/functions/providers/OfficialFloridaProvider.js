// /providers/OfficialFloridaProvider.js

const {
  BaseProvider
} = require("./BaseProvider.js");

/**
 * OfficialFloridaProvider
 *
 * Authoritative Florida corporate-registry acquisition provider.
 *
 * DATA SOURCE:
 * - Locally ingested Florida Department of State
 *   Division of Corporations public datasets.
 *
 * ARCHITECTURAL ROLE:
 *
 *     SearchIntent
 *          ↓
 * OfficialFloridaProvider
 *          ↓
 *    Local Database
 *          ↓
 *   Registry Observations
 *
 * RESPONSIBILITY:
 * - Query the locally ingested Florida registry dataset.
 * - Enforce Florida jurisdiction support.
 * - Return structured acquisition results.
 * - Preserve dataset provenance metadata when available.
 *
 * DOES NOT:
 * - Parse natural-language searches.
 * - Perform enrichment.
 * - Score or qualify prospects.
 * - Perform geographic qualification.
 * - Write to the Evidence Ledger.
 * - Query search.sunbiz.org interactively.
 */
class OfficialFloridaProvider
  extends BaseProvider {

  /**
   * @param {Object} options
   * @param {Object} options.database
   * Database service implementing search(searchIntent).
   */
  constructor({ database } = {}) {

    super(
      "OfficialFloridaProvider",
      ["FL"]
    );

    if (
      !database ||
      typeof database.search !== "function"
    ) {

      throw new Error(
        "OfficialFloridaProvider requires a database client implementing search()."
      );
    }

    this.database =
      database;
  }

  /**
   * Return capability profile metadata.
   */
  getCapabilityProfile() {

    return {

      provider:
        this.name,

      geography:
        this.supportedGeos,

      authority:
        "Florida Department of State Division of Corporations",

      sourceType:
        "official_state_dataset",

      acquisitionMode:
        "local_database",

      requiresInteractiveWebAccess:
        false,

      capabilities: [
        "legalName",
        "registrationId",
        "status",
        "entityType",
        "filingDate",
        "principalAddress",
        "mailingAddress",
        "registeredAgent"
      ],

      limitations: [
        "dataset_dependent",
        "no_direct_email",
        "no_direct_phone",
        "no_revenue",
        "no_employee_count",
        "no_sales_intent"
      ]
    };
  }

  /**
   * Search the locally ingested Florida corporate dataset.
   *
   * @param {Object} searchIntent
   * @returns {Promise<Object>}
   */
  async search(
    searchIntent
  ) {

    // ------------------------------------------------------------------------
    // SEARCH INTENT VALIDATION
    // ------------------------------------------------------------------------

    if (
      !searchIntent ||
      typeof searchIntent !== "object" ||
      Array.isArray(searchIntent)
    ) {

      throw new Error(
        "OfficialFloridaProvider requires a valid SearchIntent object."
      );
    }

    // ------------------------------------------------------------------------
    // JURISDICTION VALIDATION
    // ------------------------------------------------------------------------

    const state =
      searchIntent
        ?.geography
        ?.state;

    if (
      typeof state !== "string" ||
      state.toUpperCase() !== "FL"
    ) {

      return {

        providerStatus:
          "unsupported",

        provider:
          this.name,

        records:
          [],

        errorType:
          "UNSUPPORTED_GEOGRAPHY",

        errorMessage:
          "OfficialFloridaProvider only supports Florida (FL)."
      };
    }

    // ------------------------------------------------------------------------
    // DATABASE ACQUISITION
    // ------------------------------------------------------------------------

    try {

      const result =
        await this.database.search(
          searchIntent
        );

      /*
       * The database abstraction may eventually return either:
       *
       * 1. An array of records
       *
       * OR
       *
       * 2. A structured database response:
       *
       * {
       *   records: [],
       *   snapshotDate: "...",
       *   datasetVersion: "..."
       * }
       *
       * Support both without forcing the database implementation
       * to be rewritten immediately.
       */

      const records =
        Array.isArray(result)
          ? result
          : Array.isArray(result?.records)
            ? result.records
            : [];

      const snapshotDate =
        Array.isArray(result)
          ? null
          : result?.snapshotDate ||
            null;

      const datasetVersion =
        Array.isArray(result)
          ? null
          : result?.datasetVersion ||
            null;

      // ----------------------------------------------------------------------
      // SUCCESS / EMPTY RESULT
      // ----------------------------------------------------------------------

      return {

        providerStatus:
          records.length > 0
            ? "success"
            : "empty",

        provider:
          this.name,

        sourceType:
          "official_state_dataset",

        authority:
          "Florida Department of State Division of Corporations",

        records,

        dataset: {

          jurisdiction:
            "FL",

          snapshotDate,

          datasetVersion
        },

        errorType:
          null
      };

    } catch (error) {

      // ----------------------------------------------------------------------
      // DATABASE AVAILABILITY FAILURE
      // ----------------------------------------------------------------------

      console.error(
        `[${this.name}] DATABASE SEARCH FAILURE`,
        {
          message:
            error?.message ||
            "Unknown database error",

          searchMode:
            searchIntent.searchMode ||
            null
        }
      );

      return {

        providerStatus:
          "unavailable",

        provider:
          this.name,

        sourceType:
          "official_state_dataset",

        records:
          [],

        dataset:
          null,

        errorType:
          "DATABASE_QUERY_ERROR",

        errorMessage:
          error?.message ||
          "Unknown database error"
      };
    }
  }
}

module.exports = {
  OfficialFloridaProvider
};
