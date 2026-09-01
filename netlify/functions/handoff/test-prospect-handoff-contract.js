const assert =
  require("assert");

const {
  buildProspectHandoff,
  buildHandoffId
} = require(
  "./ProspectHandoffContract.js"
);

(() => {
  console.log(
    "1. canonical handoff contract is created"
  );

  const handoff =
    buildProspectHandoff({
      prospectKey:
        "prospect_123",

      prospect: {
        prospectName:
          "Tampa Bay Solar",

        candidateDomain:
          "tampabaysolar.com",

        website:
          "https://tampabaysolar.com/"
      },

      contacts: {
        primaryContactName:
          "Jane Doe",

        primaryContactRole:
          "Owner",

        emails: [
          {
            address:
              "jane@example.com"
          }
        ]
      },

      qualification: {
        status:
          "qualified",

        customerPriority:
          "high",

        estimatedValue:
          25000,

        timing:
          "30 days",

        nextAction:
          "Call owner",

        followUpDate:
          "2026-09-15",

        notes:
          "Strong fit."
      },

      intelligence: {
        priorityScore:
          77,

        rankingReasons: [
          "Strong discovery evidence"
        ],

        registryStatus:
          "registry_matched",

        enrichmentStatus:
          "complete"
      },

      assignment: {
        qualifiedByUserId:
          "user-123",

        assignedAgentId:
          "user-123",

        tenantId:
          "agency-001"
      },

      requestedActions: [
        "REQUEST_SALES_INTELLIGENCE",
        "CREATE_CUSTOMER_RECORD",
        "ADD_TO_FUNNEL",
        "CREATE_FOLLOW_UP_TASK"
      ],

      createdAt:
        "2026-09-01T12:00:00.000Z"
    });

  assert.strictEqual(
    handoff.contractVersion,
    "1.0"
  );

  assert.strictEqual(
    handoff.sourceApplication,
    "prospect_intelligence"
  );

  assert.strictEqual(
    handoff.qualification.status,
    "QUALIFIED"
  );

  assert.strictEqual(
    handoff.qualification.customerPriority,
    "HIGH"
  );

  assert.strictEqual(
    handoff.intelligence.priorityScore,
    77
  );

  assert.strictEqual(
    handoff.followUp.date,
    "2026-09-15"
  );

  assert.deepStrictEqual(
    handoff.requestedActions,
    [
      "REQUEST_SALES_INTELLIGENCE",
      "CREATE_CUSTOMER_RECORD",
      "ADD_TO_FUNNEL",
      "CREATE_FOLLOW_UP_TASK"
    ]
  );

  console.log(
    "2. handoff ID is deterministic for the same handoff event"
  );

  const id1 =
    buildHandoffId({
      prospectKey:
        "prospect_123",

      qualifiedByUserId:
        "user-123",

      createdAt:
        "2026-09-01T12:00:00.000Z"
    });

  const id2 =
    buildHandoffId({
      prospectKey:
        "prospect_123",

      qualifiedByUserId:
        "user-123",

      createdAt:
        "2026-09-01T12:00:00.000Z"
    });

  assert.strictEqual(
    id1,
    id2
  );

  console.log(
    "3. invalid engine score is rejected"
  );

  assert.throws(
    () =>
      buildProspectHandoff({
        prospectKey:
          "prospect_123",

        intelligence: {
          priorityScore:
            101
        }
      }),
    /between 0 and 100/
  );

  console.log(
    "4. unsupported handoff action is rejected"
  );

  assert.throws(
    () =>
      buildProspectHandoff({
        prospectKey:
          "prospect_123",

        requestedActions: [
          "DELETE_EVERYTHING"
        ]
      }),
    /Unsupported handoff action/
  );

  console.log(
    "5. engine ranking remains separate from human qualification"
  );

  const separated =
    buildProspectHandoff({
      prospectKey:
        "prospect_456",

      qualification: {
        status:
          "NURTURE",

        customerPriority:
          "LOW"
      },

      intelligence: {
        priorityScore:
          90
      }
    });

  assert.strictEqual(
    separated.qualification
      .customerPriority,
    "LOW"
  );

  assert.strictEqual(
    separated.intelligence
      .priorityScore,
    90
  );

  console.log(
    "Prospect Handoff Contract test PASSED."
  );
})();
