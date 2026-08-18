/**
 * BaseProvider
 * Standard Interface for All Corporate Registry Providers.
 */
class BaseProvider {
  constructor(name, supportedGeos = []) {
    this.name = name;
    this.supportedGeos = supportedGeos;
  }

  getCapabilityProfile() {
    return {
      provider: this.name,
      geography: this.supportedGeos,
      capabilities: [],
      limitations: []
    };
  }

  async search(geoContext, filters) {
    throw new Error(`[BaseProvider] search() not implemented in ${this.name}`);
  }

  async verifyEntity(candidate) {
    throw new Error(`[BaseProvider] verifyEntity() not implemented in ${this.name}`);
  }

  normalize(rawRecord) {
    throw new Error(`[BaseProvider] normalize() not implemented in ${this.name}`);
  }

  getSourceReference(raw, normalized) {
    throw new Error(`[BaseProvider] getSourceReference() not implemented in ${this.name}`);
  }
}

module.exports = { BaseProvider };
