const assert =
  require("assert");

const {
  buildSalesContext
} = require(
  "./SalesContext.js"
);

(() => {
  console.log(
    "1. sales context requires an offering"
  );

  assert.throws(
    () =>
      buildSalesContext({}),
    /offering is required/
  );

  console.log(
    "2. sales context normalizes reusable seller and offer context"
  );

  const context =
    buildSalesContext({
      contextId:
        " commercial_insurance_v1 ",

      contextName:
        " Commercial Insurance ",

      sellerCompany:
        " Example Agency ",

      sellerName:
        " Jane Agent ",

      sellerRole:
        " Producer ",

      offering:
        " Commercial Insurance ",

      offeringDescription:
        " Risk protection for growing businesses. ",

      valueProposition:
        " Reduce coverage gaps and improve risk visibility. ",

      problemsSolved: [
        "Rising premiums",
        "Coverage gaps",
        "Rising premiums"
      ],

      differentiators: [
        "Multiple carrier access",
        "Dedicated service"
      ],

      targetRoles: [
        "Owner",
        "CFO"
      ],

      desiredOutcome:
        "Book a 20-minute coverage review",

      preferredOutreachChannel:
        "phone",

      talkingPoints: [
        "Recent growth",
        "Renewal timing"
      ],

      constraints: [
        "Do not claim savings without evidence"
      ],

      additionalContext:
        "Focus on consultative discovery."
    });

  assert.strictEqual(
    context.contextId,
    "commercial_insurance_v1"
  );

  assert.strictEqual(
    context.offering.name,
    "Commercial Insurance"
  );

  assert.strictEqual(
    context.preferredOutreachChannel,
    "PHONE"
  );

  assert.deepStrictEqual(
    context.offering.problemsSolved,
    [
      "Rising premiums",
      "Coverage gaps"
    ]
  );

  assert.deepStrictEqual(
    context.targetRoles,
    [
      "Owner",
      "CFO"
    ]
  );

  console.log(
    "3. invalid outreach channel is rejected"
  );

  assert.throws(
    () =>
      buildSalesContext({
        offering:
          "Commercial Insurance",

        preferredOutreachChannel:
          "carrier pigeon"
      }),
    /preferredOutreachChannel is invalid/
  );

  console.log(
    "4. sales context remains independent from prospect search criteria"
  );

  const flexible =
    buildSalesContext({
      offering:
        "Cybersecurity",

      targetRoles: [
        "Owner",
        "IT Director"
      ],

      desiredOutcome:
        "Schedule a security review"
    });

  assert.strictEqual(
    flexible.offering.name,
    "Cybersecurity"
  );

  assert.strictEqual(
    flexible.desiredOutcome,
    "Schedule a security review"
  );

  console.log(
    "Sales Context test PASSED."
  );
})();
