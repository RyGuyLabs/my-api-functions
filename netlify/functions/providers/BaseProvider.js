/**
 * BaseProvider
 *
 * Standard Interface for All Corporate Registry Providers.
 *
 * IMPORTANT:
 * Providers acquire and normalize registry observations.
 * They do NOT perform:
 * - lead qualification
 * - sales scoring
 * - enrichment
 * - sales-intent inference
 */
class BaseProvider {

  constructor(
    name,
    supportedGeos = []
  ) {
    this.name =
      name || "UNKNOWN";

    this.supportedGeos =
      Array.isArray(supportedGeos)
        ? supportedGeos
        : [];
  }

  /**
   * Describe provider capabilities.
   *
   * Every concrete provider should override this.
   */
  getCapabilityProfile() {

    return {
      provider:
        this.name,

      geography:
        this.supportedGeos,

      sourceType:
        "unknown",

      capabilities:
        [],

      limitations:
        []
    };
  }

  /**
   * Search the provider using a structured SearchIntent.
   *
   * @param {Object} searchIntent
   * @returns {Promise<Object>}
   */
  async search(
    searchIntent
  ) {

    throw new Error(
      `[BaseProvider] search() not implemented in ${this.name}`
    );
  }

  /**
   * Verify a candidate entity against the authoritative provider.
   *
   * Optional provider capability.
   *
   * @param {Object} candidate
   * @returns {Promise<Object>}
   */
  async verifyEntity(
    candidate
  ) {

    throw new Error(
      `[BaseProvider] verifyEntity() not implemented in ${this.name}`
    );
  }

  /**
   * Convert a raw provider observation into the
   * universal normalized entity structure.
   *
   * @param {Object} rawRecord
   * @returns {Object}
   */
  normalize(
    rawRecord
  ) {

    throw new Error(
      `[BaseProvider] normalize() not implemented in ${this.name}`
    );
  }

  /**
   * Return an authoritative source reference for
   * a registry observation.
   *
   * @param {Object} rawRecord
   * @param {Object} normalizedRecord
   * @returns {string}
   */
  getSourceReference(
    rawRecord,
    normalizedRecord
  ) {

    throw new Error(
      `[BaseProvider] getSourceReference() not implemented in ${this.name}`
    );
  }
}

module.exports = {
  BaseProvider
};
