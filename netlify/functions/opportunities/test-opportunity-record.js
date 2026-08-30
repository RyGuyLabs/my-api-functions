const assert = require("node:assert/strict");

const {
  buildOpportunityRecord
} = require("./OpportunityRecord.js");

const lead = {
  prospectId:
    "prospect_test_001",

  prospectName:
    "TEST COMPANY LLC",

  location: {
    state: "FL",
    city: "Miami"
  },

  locationDisplay:
    "Miami, FL",

  entity: {
    registrationId:
      "L26000432480",

    companyName:
      "TEST COMPANY LLC",

    status:
      "ACTIVE",

    entityType:
      "LLC"
  },

  score:
    90,

  priority:
    "HIGH PRIORITY",

  qualificationReasons: [
    "Verified ACTIVE registration."
  ],

  salesSignals: [],

  recommendedAction:
    "Initiate outreach.",

  evidenceSummary: [
    "Verified registry observation."
  ],

  evidenceLedger: {
    inputSignalId:
      "sig_test_001",

    contentHash:
      "sha256_test_content",

    signalRecordHash:
      "sha256_test_signal"
  }
};

const normalizedEvent = {
  eventId:
    "evt_test_001",

  entityId:
    "L26000432480",

  eventType:
    "OFFICER_ADDED",

  detectedAt:
    "2026-08-30T18:00:00.000Z",

  effectiveAt:
    null,

  sourceType:
    "official_state_dataset",

  sourceReference: {
    state: "FL",
    registrationId:
      "L26000432480"
  },

  before:
    null,

  after: {
    name:
      "NEW OFFICER"
  },

  evidenceHash:
    "evidence_test_001",

  eventHash:
    "event_hash_test_001"
};

const commercialEvent = {
  normalizedEventId:
    "evt_test_001",

  entityId:
    "L26000432480",

  commercialEventType:
    "LEADERSHIP_CHANGE",

  reasonCode:
    "OFFICER_ADDED",

  occurredAt:
    "2026-08-30T18:00:00.000Z",

  detectedAt:
    "2026-08-30T18:00:00.000Z",

  sourceType:
    "official_state_dataset",

  sourceReference: {
    state: "FL",
    registrationId:
      "L26000432480"
  },

  evidenceHash:
    "evidence_test_001"
};

function makeFit(profileId) {
  return {
    profileId,

    entityId:
      "L26000432480",

    commercialEventType:
      "LEADERSHIP_CHANGE",

    matched:
      true,

    reasonCodes: [
      "GEOGRAPHY_MATCH",
      "CLASSIFICATION_MATCH",
      "ENTITY_TYPE_MATCH",
      "EVENT_TYPE_MATCH",
      "SIGNAL_AGE_MATCH"
    ],

    failedReasonCodes: [],

    signalAgeHours:
      4
  };
}

function run() {
  console.log(
    "1. matched event produces opportunity"
  );

  const first =
    buildOpportunityRecord({
      lead,
      normalizedEvent,
      commercialEvent,
      customerFit:
        makeFit(
          "customer-a"
        )
    });

  assert.ok(
    first.opportunityId.startsWith(
      "opp_"
    )
  );

  assert.equal(
    first.prospectId,
    "prospect_test_001"
  );

  assert.equal(
    first.prospectName,
    "TEST COMPANY LLC"
  );

  assert.equal(
    first.entityId,
    "L26000432480"
  );

  assert.equal(
    first.commercialEventType,
    "LEADERSHIP_CHANGE"
  );

  assert.equal(
    first.commercialReasonCode,
    "OFFICER_ADDED"
  );

  assert.equal(
    first.customerProfileId,
    "customer-a"
  );

  assert.equal(
    first.signalAgeHours,
    4
  );

  console.log(
    "2. same event plus same customer is deterministic"
  );

  const replay =
    buildOpportunityRecord({
      lead,
      normalizedEvent,
      commercialEvent,
      customerFit:
        makeFit(
          "customer-a"
        )
    });

  assert.equal(
    replay.opportunityId,
    first.opportunityId
  );

  console.log(
    "3. same event plus different customer gets different opportunity"
  );

  const otherCustomer =
    buildOpportunityRecord({
      lead,
      normalizedEvent,
      commercialEvent,
      customerFit:
        makeFit(
          "customer-b"
        )
    });

  assert.notEqual(
    otherCustomer.opportunityId,
    first.opportunityId
  );

  console.log(
    "4. unmatched fit cannot become opportunity"
  );

  assert.throws(
    () =>
      buildOpportunityRecord({
        lead,
        normalizedEvent,
        commercialEvent,
        customerFit: {
          ...makeFit(
            "customer-a"
          ),
          matched:
            false,
          failedReasonCodes: [
            "EVENT_TYPE_MISMATCH"
          ]
        }
      }),
    /matched customer-fit result/
  );

  console.log(
    "5. evidence bindings are preserved"
  );

  assert.equal(
    first.evidence.normalizedEventId,
    "evt_test_001"
  );

  assert.equal(
    first.evidence.eventHash,
    "event_hash_test_001"
  );

  assert.equal(
    first.evidence.evidenceHash,
    "evidence_test_001"
  );

  assert.equal(
    first.evidence.evidenceLedger.inputSignalId,
    "sig_test_001"
  );

  console.log(
    "6. whyThisCustomer carries deterministic fit reasons"
  );

  assert.deepEqual(
    first.whyThisCustomer,
    [
      "GEOGRAPHY_MATCH",
      "CLASSIFICATION_MATCH",
      "ENTITY_TYPE_MATCH",
      "EVENT_TYPE_MATCH",
      "SIGNAL_AGE_MATCH"
    ]
  );

  console.log(
    "7. lead snapshot excludes enrichment payload"
  );

  assert.equal(
    first.lead.prospectName,
    "TEST COMPANY LLC"
  );

  assert.equal(
    Object.prototype.hasOwnProperty.call(
      first.lead,
      "enrichment"
    ),
    false
  );

  console.log(
    "8. lead snapshot is isolated from later source mutation"
  );

  const mutableLead = {
    ...lead,

    location: {
      ...lead.location
    },

    entity: {
      ...lead.entity
    }
  };

  const isolated =
    buildOpportunityRecord({
      lead:
        mutableLead,
      normalizedEvent,
      commercialEvent,
      customerFit:
        makeFit(
          "customer-isolation"
        )
    });

  mutableLead.location.city =
    "Orlando";

  mutableLead.entity.status =
    "INACTIVE";

  assert.equal(
    isolated.lead.location.city,
    "Miami"
  );

  assert.equal(
    isolated.lead.entity.status,
    "ACTIVE"
  );

  assert.equal(
    Object.isFrozen(
      isolated.lead.location
    ),
    true
  );

  assert.equal(
    Object.isFrozen(
      isolated.lead.entity
    ),
    true
  );

  console.log("");
  console.log(
    "Opportunity Record test PASSED."
  );
}

run();
