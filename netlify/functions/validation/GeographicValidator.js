// /validation/GeographicValidator.js

/**
 * GeographicValidator
 *
 * Evaluates target search geography against observed registry addresses.
 * Preserves the raw registry observation while providing deterministic validation.
 */
class GeographicValidator {
  /**
   * Validate target geography against observed registry record.
   *
   * @param {Object} targetGeography - { state, city, county, zip }
   * @param {Object} observedAddresses - { principalAddress, mailingAddress }
   * @returns {Object} Validation result with match basis
   */
  static validate(targetGeography, observedAddresses = {}) {
    if (!targetGeography || !targetGeography.state) {
      return {
        matched: false,
        reason: "MISSING_TARGET_GEOGRAPHY",
        basis: null
      };
    }

    const targetState = targetGeography.state.toUpperCase();
    const targetCity = targetGeography.city ? targetGeography.city.toLowerCase() : null;

    const principal = observedAddresses.principalAddress || {};
    const mailing = observedAddresses.mailingAddress || {};

    // 1. Verify Principal Address Match
    if (principal.state && principal.state.toUpperCase() === targetState) {
      if (!targetCity || (principal.city && principal.city.toLowerCase() === targetCity)) {
        return {
          matched: true,
          basis: "principal_address",
          target: targetGeography,
          observed: principal
        };
      }
    }

    // 2. Verify Mailing Address Match
    if (mailing.state && mailing.state.toUpperCase() === targetState) {
      if (!targetCity || (mailing.city && mailing.city.toLowerCase() === targetCity)) {
        return {
          matched: true,
          basis: "mailing_address",
          target: targetGeography,
          observed: mailing
        };
      }
    }

    return {
      matched: false,
      reason: "GEOGRAPHIC_MISMATCH",
      basis: null,
      target: targetGeography,
      observed: { principal, mailing }
    };
  }
}

module.exports = {
  GeographicValidator
};
