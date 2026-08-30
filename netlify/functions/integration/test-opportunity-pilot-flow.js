const assert = require("node:assert/strict");

const {
  detectEntityChanges
} = require("../events/EntityChangeDetector.js");

const {
  translateNormalizedChangeEvent
} = require("../events/CommercialEventTranslator.js");

const {
  evaluateCustomerFit
} = require("../customer-fit/CustomerFitEvaluator.js");

const {
  buildOpportunityRecord
} = require("../opportunities/OpportunityRecord.js");

const {
  toOpportunityExportRow,
  opportunitiesToCsv
} = require("../exports/OpportunityExport.js");

const DETECTED_AT =
  "2026-08-30T18:00:00.000Z";

const AS_OF =
  "2026-08-30T22:00:00.000Z";

const beforeEntity = {
  registration_id:
    "L26000432480",

  company_name:
    "TEST FLORIDA COMPANY LLC",

  entity_type:
    "LLC",

  status:
    "INACTIVE",

  principal_address_line1:
    "100 TEST STREET",

  principal_address_line2:
    null,

  principal_city:
    "MIAMI",

  principal_state:
    "FL",

  principal_zip:
    "33144",

  mailing_address_line1:
    "100 TEST STREET",

  mailing_address_line2:
    null,

  mailing_city:
    "MIAMI",

  mailing_state:
    "FL",

  mailing_zip:
    "33144",

  registered_agent_name:
    "TEST AGENT"
};

const afterEntity = {
  ...beforeEntity,

  status:
    "ACTIVE"
};

const customerProfile = {
  profileId:
    "pilot-customer-001",

  geography: {
    states: ["FL"],
    cities: ["MIAMI"],
    counties: [],
    zips: []
  },

  industryClassifications: [
    "238210"
  ],

  entityTypes: [
    "LLC"
  ],

  targetCommercialEventTypes: [
    "ENTITY_ACTIVATION"
  ],

  maxSignalAgeHours:
    24
};

const entityContext = {
  classificationCode:
    "238210",

  entityType:
    "LLC",

  location: {
    state: "FL",
    city: "Miami",
    county: "Miami-Dade",
    zip: "33144"
  }
};

const lead = {
  prospectId:
    "prospect_test_activation",

  prospectName:
    "TEST FLORIDA COMPANY LLC",

  location: {
    state: "FL",
    city: "Miami",
    county: "Miami-Dade",
    zip: "33144"
  },

  locationDisplay:
    "Miami, FL",

  entity: {
    registrationId:
      "L26000432480",

    companyName:
      "TEST FLORIDA COMPANY LLC",

    status:
      "ACTIVE",

    entityType:
      "LLC",

    classificationCode:
      "238210"
  },

  score:
    90,

  priority:
    "HIGH PRIORITY",

  qualificationReasons: [
    "Verified ACTIVE state registration."
  ],

  salesSignals: [],

  recommendedAction:
    "Review activation trigger and initiate appropriate outreach.",

  evidenceSummary: [
    "Verified Florida registry observation."
  ],

  evidenceLedger: {
    inputSignalId:
      "sig_test_activation",

    contentHash:
      "sha256_test_activation_content",

    signalRecordHash:
      "sha256_test_activation_signal"
  }
};

function run() {
  console.log(
    "1. entity status change is detected"
  );

  const normalizedEvents =
    detectEntityChanges({
      before:
        beforeEntity,
      after:
        afterEntity,
      detectedAt:
        DETECTED_AT,
      sourceType:
        "official_state_dataset",
      sourceReference: {
        state: "FL",
        registrationId:
          "L26000432480"
      },
      evidenceHash:
        "evidence_activation_001"
    });

  assert.equal(
    normalizedEvents.length,
    1
  );

  const normalizedEvent =
    normalizedEvents[0];

  assert.equal(
    normalizedEvent.eventType,
    "STATUS_CHANGED"
  );

  assert.deepEqual(
    normalizedEvent.before,
    {
      status: "INACTIVE"
    }
  );

  assert.deepEqual(
    normalizedEvent.after,
    {
      status: "ACTIVE"
    }
  );

  console.log(
    "2. normalized status change becomes entity activation"
  );

  const commercialEvent =
    translateNormalizedChangeEvent(
      normalizedEvent
    );

  assert.equal(
    commercialEvent.commercialEventType,
    "ENTITY_ACTIVATION"
  );

  assert.equal(
    commercialEvent.reasonCode,
    "STATUS_BECAME_ACTIVE"
  );

  console.log(
    "3. customer profile matches activation"
  );

  const customerFit =
    evaluateCustomerFit({
      commercialEvent,
      entityContext,
      customerProfile,
      asOf:
        AS_OF
    });

  assert.equal(
    customerFit.matched,
    true
  );

  assert.equal(
    customerFit.signalAgeHours,
    4
  );

  assert.deepEqual(
    customerFit.failedReasonCodes,
    []
  );

  console.log(
    "4. matched trigger becomes opportunity record"
  );

  const opportunity =
    buildOpportunityRecord({
      lead,
      normalizedEvent,
      commercialEvent,
      customerFit
    });

  assert.ok(
    opportunity.opportunityId.startsWith(
      "opp_"
    )
  );

  assert.equal(
    opportunity.commercialEventType,
    "ENTITY_ACTIVATION"
  );

  assert.equal(
    opportunity.customerProfileId,
    "pilot-customer-001"
  );

  assert.equal(
    opportunity.signalAgeHours,
    4
  );

  console.log(
    "5. opportunity flattens into pilot export row"
  );

  const row =
    toOpportunityExportRow(
      opportunity
    );

  assert.equal(
    row.company,
    "TEST FLORIDA COMPANY LLC"
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
    row.commercialTrigger,
    "ENTITY_ACTIVATION"
  );

  assert.equal(
    row.triggerReason,
    "STATUS_BECAME_ACTIVE"
  );

  assert.equal(
    row.qualificationScore,
    90
  );

  console.log(
    "6. final CSV contains actionable pilot record"
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
    csv.includes(
      "TEST FLORIDA COMPANY LLC"
    )
  );

  assert.ok(
    csv.includes(
      "ENTITY_ACTIVATION"
    )
  );

  assert.ok(
    csv.includes(
      "STATUS_BECAME_ACTIVE"
    )
  );

  assert.ok(
    csv.includes(
      "HIGH PRIORITY"
    )
  );

  console.log(
    "7. replay produces same opportunity identity"
  );

  const replayCommercialEvent =
    translateNormalizedChangeEvent(
      normalizedEvent
    );

  const replayFit =
    evaluateCustomerFit({
      commercialEvent:
        replayCommercialEvent,
      entityContext,
      customerProfile,
      asOf:
        AS_OF
    });

  const replayOpportunity =
    buildOpportunityRecord({
      lead,
      normalizedEvent,
      commercialEvent:
        replayCommercialEvent,
      customerFit:
        replayFit
    });

  assert.equal(
    replayOpportunity.opportunityId,
    opportunity.opportunityId
  );

  console.log("");
  console.log(
    "Opportunity Pilot Flow test PASSED."
  );
}

run();
