// netlify/functions/providers/OfficialFloridaProvider.js

const { BaseProvider } = require("./BaseProvider");

class OfficialFloridaProvider extends BaseProvider {
  constructor({ database } = {}) {
    super();
    this.database = database || null;
    this.name = "OfficialFloridaProvider";
    this.sourceType = "official_state_dataset";
    this.authority = "Florida Department of State Division of Corporations";
  }

  getCapabilityProfile() {
    return {
      provider: this.name,
      geography: ["FL"],
      sourceType: this.sourceType,
      acquisitionMode: "local_database",
      requiresInteractiveWebAccess: false,
      authority: this.authority
    };
  }

  async search(searchIntent) {
    if (!this.database) {
      return {
        providerStatus: "unavailable",
        provider: this.name,
        sourceType: this.sourceType,
        authority: this.authority,
        records: [],
        errorType: "DATABASE_UNAVAILABLE",
        errorMessage: "FloridaRegistryDatabase reference is not configured."
      };
    }

    const state = searchIntent?.geography?.state;
    if (state && state.toUpperCase() !== "FL") {
      return {
        providerStatus: "unsupported",
        provider: this.name,
        sourceType: this.sourceType,
        authority: this.authority,
        records: [],
        errorType: "UNSUPPORTED_GEOGRAPHY",
        errorMessage: `OfficialFloridaProvider only supports FL state searches. Received: ${state}`
      };
    }

    try {
      const records = await this.database.search(searchIntent);
      return {
        providerStatus: "success",
        provider: this.name,
        sourceType: this.sourceType,
        authority: this.authority,
        records: Array.isArray(records) ? records : [],
        dataset: {
          jurisdiction: "FL",
          authority: this.authority
        }
      };
    } catch (err) {
      return {
        providerStatus: "unavailable",
        provider: this.name,
        sourceType: this.sourceType,
        authority: this.authority,
        records: [],
        errorType: "DATABASE_QUERY_ERROR",
        errorMessage: err.message
      };
    }
  }

  /**
   * Defensive identity-style normalizer for Florida registry records.
   * Preserves canonical schema without delegating to BaseProvider.normalize().
   */
  normalize(rawRecord) {
    if (!rawRecord || typeof rawRecord !== "object" || Array.isArray(rawRecord)) {
      throw new Error("Invalid raw record: expected a non-null object.");
    }

    if (!rawRecord.companyName || typeof rawRecord.companyName !== "string" || !rawRecord.companyName.trim()) {
      throw new Error("Invalid raw record: companyName is required and must be a non-empty string.");
    }

    return {
      registrationId: rawRecord.registrationId || null,
      companyName: rawRecord.companyName,
      entityType: rawRecord.entityType || null,
      status: rawRecord.status || "UNKNOWN",
      formationDate: rawRecord.formationDate || null,
      principalAddress: rawRecord.principalAddress
        ? { ...rawRecord.principalAddress }
        : null,
      mailingAddress: rawRecord.mailingAddress
        ? { ...rawRecord.mailingAddress }
        : null,
      registeredAgent: rawRecord.registeredAgent || null,
      source: rawRecord.source
        ? { ...rawRecord.source }
        : null
    };
  }

  /**
   * Deterministic authoritative Sunbiz source reference link generator.
   */
  getSourceReference(rawRecord = {}, normalizedRecord = {}) {
    const regId = normalizedRecord.registrationId || rawRecord.registrationId;
    
    if (!regId) {
      return "https://search.sunbiz.org/";
    }

    const compName = normalizedRecord.companyName || rawRecord.companyName || "";
    const encodedName = encodeURIComponent(compName);
    const encodedRegId = encodeURIComponent(regId);

    return `https://search.sunbiz.org/Inquiry/CorporationSearch/SearchResultDetail?inquirytype=EntityName&directionType=Initial&searchNameOrder=${encodedName}&aggregateId=${encodedRegId}`;
  }
}

module.exports = { OfficialFloridaProvider };
