// /acquisition/RegistryAcquisitionService.js

/**
 * RegistryAcquisitionService
 *
 * Universal acquisition boundary for authoritative business-registry
 * providers.
 *
 * RESPONSIBILITY:
 * - Execute structured registry searches.
 * - Validate provider availability/results contracts.
 * - Expose provider capability metadata.
 *
 * DOES NOT:
 * - Parse raw user language.
 * - Perform industry classification.
 * - Perform geographic qualification.
 * - Normalize registry entities.
 * - Perform enrichment.
 * - Score or qualify prospects.
 * - Write to the Evidence Ledger.
 *
 * ARCHITECTURAL ROLE:
 *
 *     SearchIntent
 *          ↓
 * RegistryAcquisitionService
 *          ↓
 *      Provider
 *          ↓
 *   Registry Records
 */
class RegistryAcquisitionService {

  /**
   * @param {Object} provider
   * Provider implementing search().
   */
  constructor(provider) {

    if (
      !provider ||
      typeof provider !== "object"
    ) {
      throw new Error(
        "RegistryAcquisitionService requires a provider."
      );
    }

    if (
      typeof provider.search !==
      "function"
    ) {
      throw new Error(
        `Registry provider ${
          provider.name || "UNKNOWN"
        } does not implement search().`
      );
    }

    this.provider =
      provider;
  }

  /**
   * Execute a registry search using a structured SearchIntent.
   *
   * IMPORTANT:
   * This service does not interpret raw user queries.
   * The caller must provide a structured SearchIntent.
   *
   * @param {Object} searchIntent
   * @returns {Promise<Object>}
   */
  async search(
    searchIntent
  ) {

    if (
      !searchIntent ||
      typeof searchIntent !== "object" ||
      Array.isArray(searchIntent)
    ) {
      throw new Error(
        "Registry search requires a valid SearchIntent object."
      );
    }

    let response;

    try {

      response =
        await this.provider.search(
          searchIntent
        );

    } catch (error) {

      console.error(
        `[RegistryAcquisitionService] Provider search failed`,
        {
          provider:
            this.getProviderName(),

          message:
            error?.message ||
            "Unknown provider error"
        }
      );

      /*
       * IMPORTANT:
       * Do not convert provider exceptions into empty searches.
       *
       * An empty result and provider failure are
       * fundamentally different states.
       */
      throw error;
    }

    /*
     * Provider response must be an object.
     */
    if (
      !response ||
      typeof response !== "object" ||
      Array.isArray(response)
    ) {

      throw new Error(
        `Registry provider ${
          this.getProviderName()
        } returned an invalid search response.`
      );
    }

    /*
     * Records must always be an array.
     *
     * Missing records are normalized to [] because
     * a valid provider response may legitimately contain
     * zero records.
     */
    if (
      response.records === undefined
    ) {

      response.records = [];
    }

    if (
      !Array.isArray(
        response.records
      )
    ) {

      throw new Error(
        `Registry provider ${
          this.getProviderName()
        } returned an invalid records collection.`
      );
    }

    /*
     * Ensure provider identity is always available.
     */
    if (
      !response.provider
    ) {

      response.provider =
        this.getProviderName();
    }

    /*
     * ProviderStatus is authoritative.
     *
     * If the provider does not explicitly provide one,
     * treat the completed call as successful.
     *
     * This does NOT mean records were found.
     * A successful search may legitimately contain zero records.
     */
    if (
      !response.providerStatus
    ) {

      response.providerStatus =
        "success";
    }

    return response;
  }

  /**
   * Return capability profile metadata from the configured provider.
   *
   * @returns {Object}
   */
  getCapabilityProfile() {

    if (
      typeof this.provider
        .getCapabilityProfile ===
      "function"
    ) {

      return this.provider
        .getCapabilityProfile();
    }

    return {

      provider:
        this.getProviderName(),

      sourceType:
        "unknown",

      geography:
        [],

      capabilities:
        [],

      limitations:
        [
          "capability_profile_unavailable"
        ]
    };
  }

  /**
   * Return the configured provider name.
   *
   * @returns {string}
   */
  getProviderName() {

    return (
      this.provider?.name ||
      "UNKNOWN"
    );
  }

  /**
   * Return the underlying provider instance.
   *
   * Useful for orchestration layers that need provider-specific
   * capabilities without reconstructing the dependency.
   *
   * @returns {Object}
   */
  getProvider() {

    return this.provider;
  }
}

module.exports = {
  RegistryAcquisitionService
};
