import { BaseProvider } from "./BaseProvider.js";

export class SunbizProvider extends BaseProvider {
  constructor() {
    super("SunbizProvider", ["FL"]);
  }

  getCapabilityProfile() {
    return {
      provider: this.name,
      geography: this.supportedGeos,
      capabilities: [
        "legal_name",
        "entity_type",
        "status",
        "filing_date",
        "principal_address",
        "registered_agent"
      ],
      limitations: [
        "no_direct_email",
        "no_employee_count",
        "no_revenue_figures"
      ]
    };
  }

  async search(geoContext, filters) {
    // Simulated Sunbiz fetch matching Florida structure
    // (Replace with actual Sunbiz HTML/API parser execution)
    return [
      {
        cor_number: "L18000123456",
        name: "SUNSHINE ROOFING & REPAIR LLC",
        status: "ACTIVE",
        filing_date: "2018-03-15",
        city: "Tampa",
        state: "FL",
        zip: "33602",
        agent: "DOE, JOHN"
      }
    ];
  }

  normalize(rawRecord) {
    return {
      companyName: rawRecord.name,
      jurisdiction: "FL",
      entityType: "LLC",
      status: rawRecord.status,
      formationDate: rawRecord.filing_date,
      location: {
        city: rawRecord.city,
        state: rawRecord.state,
        zip: rawRecord.zip
      },
      registeredAgent: rawRecord.agent,
      registrationId: rawRecord.cor_number
    };
  }
}
