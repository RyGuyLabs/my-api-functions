const assert = require("node:assert/strict");

const {
  CSV_COLUMNS,
  toOpportunityExportRow,
  opportunitiesToCsv,
  escapeCsvValue
} = require("./OpportunityExport.js");

const opportunity = {
  opportunityId:
    "opp_test_001",

  prospectId:
    "prospect_test_001",

  prospectName:
    "TEST COMPANY, LLC",

  entityId:
    "L26000432480",

  normalizedEventId:
    "evt_test_001",

  commercialEventType:
    "LEADERSHIP_CHANGE",

  commercialReasonCode:
    "OFFICER_ADDED",

  occurredAt:
    "2026-08-30T18:00:00.000Z",

  detectedAt:
    "2026-08-30T18:05:00.000Z",

  customerProfileId:
    "customer-a",

  whyThisCustomer: [
    "GEOGRAPHY_MATCH",
    "CLASSIFICATION_MATCH",
    "EVENT_TYPE_MATCH"
  ],

  signalAgeHours:
    4,

  evidence: {
    sourceType:
      "official_state_dataset",

    sourceReference: {
      state: "FL",
      registrationId:
        "L26000432480"
    },

    normalizedEventId:
      "evt_test_001",

    evidenceHash:
      "evidence_test_001"
  },

  lead: {
    prospectId:
      "prospect_test_001",

    prospectName:
      "TEST COMPANY, LLC",

    location: {
      state: "FL",
      city: "Miami"
    },

    locationDisplay:
      "Miami, FL",

    entity: {
      registrationId:
        "L26000432480",

      entityType:
        "LLC"
    },

    score:
      90,

    priority:
      "HIGH PRIORITY",

    qualificationReasons: [],

    salesSignals: [],

    recommendedAction:
      "Review leadership change and initiate outreach.",

    evidenceSummary: []
  }
};

function run() {
  console.log(
    "1. opportunity flattens into pilot row"
  );

  const row =
    toOpportunityExportRow(
      opportunity
    );

  assert.equal(
    row.opportunityId,
    "opp_test_001"
  );

  assert.equal(
    row.company,
    "TEST COMPANY, LLC"
  );

  assert.equal(
    row.registrationId,
    "L26000432480"
  );

  assert.equal(
    row.location,
    "Miami, FL"
  );

  assert.equal(
    row.entityType,
    "LLC"
  );

  assert.equal(
    row.commercialTrigger,
    "LEADERSHIP_CHANGE"
  );

  assert.equal(
    row.triggerReason,
    "OFFICER_ADDED"
  );

  assert.equal(
    row.signalAgeHours,
    4
  );

  assert.equal(
    row.qualificationScore,
    90
  );

  console.log(
    "2. why-this-customer reasons flatten deterministically"
  );

  assert.equal(
    row.whyThisCustomer,
    "GEOGRAPHY_MATCH | CLASSIFICATION_MATCH | EVENT_TYPE_MATCH"
  );

  console.log(
    "3. source reference is preserved"
  );

  assert.equal(
    row.sourceReference,
    JSON.stringify({
      state: "FL",
      registrationId:
        "L26000432480"
    })
  );

  console.log(
    "4. CSV column order is stable"
  );

  assert.deepEqual(
    CSV_COLUMNS.map(
      ([key]) => key
    ),
    [
      "opportunityId",
      "company",
      "registrationId",
      "location",
      "entityType",
      "commercialTrigger",
      "triggerReason",
      "whyThisCustomer",
      "occurredAt",
      "detectedAt",
      "signalAgeHours",
      "qualificationScore",
      "priority",
      "recommendedAction",
      "sourceType",
      "sourceReference",
      "normalizedEventId",
      "evidenceHash"
    ]
  );

  console.log(
    "5. CSV escaping handles commas and quotes"
  );

  assert.equal(
    escapeCsvValue(
      'ACME, "Florida"'
    ),
    '"ACME, ""Florida"""'
  );

  console.log(
    "6. single opportunity exports with header and row"
  );

  const csv =
    opportunitiesToCsv([
      opportunity
    ]);

  const lines =
    csv.split("\n");

  assert.equal(
    lines.length,
    2
  );

  assert.ok(
    lines[0].startsWith(
      "Opportunity ID,Company,Registration ID"
    )
  );

  assert.ok(
    lines[1].includes(
      '"TEST COMPANY, LLC"'
    )
  );

  assert.ok(
    lines[1].includes(
      '"Miami, FL"'
    )
  );

  console.log(
    "7. multiple opportunities produce multiple rows"
  );

  const second = {
    ...opportunity,

    opportunityId:
      "opp_test_002",

    prospectName:
      "SECOND COMPANY LLC",

    lead: {
      ...opportunity.lead,

      prospectName:
        "SECOND COMPANY LLC"
    }
  };

  const multiCsv =
    opportunitiesToCsv([
      opportunity,
      second
    ]);

  assert.equal(
    multiCsv.split("\n").length,
    3
  );

  assert.ok(
    multiCsv.includes(
      "opp_test_001"
    )
  );

  assert.ok(
    multiCsv.includes(
      "opp_test_002"
    )
  );

  console.log(
    "8. invalid opportunity is rejected"
  );

  assert.throws(
    () =>
      toOpportunityExportRow(
        {}
      ),
    /requires opportunityId/
  );

  console.log("");
  console.log(
    "Opportunity Export test PASSED."
  );
}

run();
