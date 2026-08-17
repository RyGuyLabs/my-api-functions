export class BaseProvider {
  constructor(name, supportedGeos) {
    this.name = name;
    this.supportedGeos = supportedGeos; // e.g. ["FL"]
  }

  /**
   * Returns compliance, terms of use, and privacy boundaries
   */
  getAccessPolicy() {
    return {
      sourceType: "official_public_registry",
      permittedUse: "commercial_lead_generation",
      attributionRequired: false,
      restrictions: ["no_bulk_resale_raw_pii"],
    };
  }

  /**
   * Returns what fields this provider can and cannot populate
   */
  getCapabilityProfile() {
    throw new Error("getCapabilityProfile() must be implemented by subclass");
  }

  /**
   * Search for raw records matching search parameters
   */
  async search(geoContext, filters) {
    throw new Error("search() must be implemented by subclass");
  }

  /**
   * Normalize raw state payload into standardized prospect entity structure
   */
  normalize(rawRecord) {
    throw new Error("normalize() must be implemented by subclass");
  }
}
