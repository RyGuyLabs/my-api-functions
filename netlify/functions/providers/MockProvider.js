const { BaseProvider } = require("./BaseProvider.js");

/**
 * MockProvider
 * Development-only provider for visual UI testing.
 * Strictly gated behind MOCK_PROVIDER=true environment configuration.
 */
class MockProvider extends BaseProvider {
  constructor() {
    super("MockProvider", ["FL", "TX", "CA"]);
  }

  async search(geoContext, filters) {
    const city = geoContext?.city || "Tampa";
    const state = geoContext?.state || "FL";
    const ind = (filters?.industry || "Commercial").toUpperCase();

    return [
      {
        cor_number: "L24000012345",
        name: `APEX ${ind} SERVICES LLC`,
        status: "ACTIVE",
        filing_date: "2019-04-12",
        city: city,
        state: state,
        zip: "33602",
        agent: "DOE, JOHN",
        isMockData: true
      },
      {
        cor_number: "L22000098765",
        name: `SUNSHINE ${ind} GROUP INC`,
        status: "ACTIVE",
        filing_date: "2021-08-20",
        city: city,
        state: state,
        zip: "33607",
        agent: "SMITH, JANE",
        isMockData: true
      }
    ];
  }

  normalize(raw) {
    return {
      companyName: raw.name,
      jurisdiction: raw.state,
      entityType: raw.name.includes("INC") ? "CORPORATION" : "LIMITED LIABILITY COMPANY",
      status: raw.status,
      formationDate: raw.filing_date,
      location: {
        city: raw.city,
        state: raw.state,
        zip: raw.zip
      },
      locationDisplay: `${raw.city}, ${raw.state}`,
      registeredAgent: raw.agent,
      registrationId: raw.cor_number,
      isMockData: true
    };
  }

  getSourceReference() {
    return "https://ryguylabs.com/mock-ledger-reference";
  }
}

module.exports = { MockProvider };
