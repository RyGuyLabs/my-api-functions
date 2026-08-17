class BaseProvider {
  constructor(name, supportedGeos) {
    this.name = name;
    this.supportedGeos = supportedGeos;
  }

  getAccessPolicy() {
    return {
      sourceType: "official_public_registry",
      permittedUse: "commercial_lead_generation",
      attributionRequired: false,
      restrictions: ["no_bulk_resale_raw_pii"],
    };
  }

  getCapabilityProfile() {
    throw new Error("getCapabilityProfile() must be implemented by subclass");
  }

  async search(geoContext, filters) {
    throw new Error("search() must be implemented by subclass");
  }

  normalize(rawRecord) {
    throw new Error("normalize() must be implemented by subclass");
  }
}

module.exports = { BaseProvider };
