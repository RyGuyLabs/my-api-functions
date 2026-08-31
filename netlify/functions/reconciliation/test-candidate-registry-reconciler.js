const assert =
  require("assert");

const {
  CandidateRegistryReconciler
} = require(
  "./CandidateRegistryReconciler.js"
);

const fakeDatabase = {
  async findCompanyMatches({
    companyName,
    city,
    state
  }) {
    assert.strictEqual(
      state,
      "FL"
    );

    assert.strictEqual(
      city,
      "Tampa"
    );

    if (
      companyName.includes(
        "Tampa Bay Solar"
      )
    ) {
      return [
        {
          registrationId:
            "TEST123",
          companyName:
            "TAMPA BAY SOLAR LLC",
          status:
            "UNKNOWN",
          principalAddress: {
            city:
              "Tampa",
            state:
              "FL"
          }
        },
        {
          registrationId:
            "TEST999",
          companyName:
            "TAMPA SOLAR SERVICES INC",
          status:
            "UNKNOWN",
          principalAddress: {
            city:
              "Tampa",
            state:
              "FL"
          }
        }
      ];
    }

    return [];
  }
};

(async () => {
  const reconciler =
    new CandidateRegistryReconciler({
      database:
        fakeDatabase
    });

  console.log(
    "1. legal suffixes are normalized"
  );

  assert.strictEqual(
    reconciler.normalizeCompanyName(
      "Tampa Bay Solar, LLC"
    ),
    "tampa bay solar"
  );

  console.log(
    "2. equivalent legal names score as exact normalized matches"
  );

  assert.strictEqual(
    reconciler.calculateNameSimilarity(
      "Tampa Bay Solar",
      "TAMPA BAY SOLAR LLC"
    ),
    1
  );

  console.log(
    "3. token overlap produces deterministic partial similarity"
  );

  const partial =
    reconciler.calculateNameSimilarity(
      "Tampa Bay Solar",
      "Tampa Solar Services Inc."
    );

  assert(
    partial > 0 &&
    partial < 1
  );

  console.log(
    "4. matching candidate resolves to authoritative registry entity"
  );

  const matched =
    await reconciler.reconcile(
      {
        candidateName:
          "Tampa Bay Solar",
        candidateDomain:
          "tampabaysolar.com"
      },
      {
        city:
          "Tampa",
        state:
          "FL"
      }
    );

  assert.strictEqual(
    matched.status,
    "registry_matched"
  );

  assert.strictEqual(
    matched.registryMatch.registrationId,
    "TEST123"
  );

  assert.strictEqual(
    matched.confidence,
    1
  );

  console.log(
    "5. absent registry candidate remains unmatched"
  );

  const unmatched =
    await reconciler.reconcile(
      {
        candidateName:
          "Completely Different Business"
      },
      {
        city:
          "Tampa",
        state:
          "FL"
      }
    );

  assert.strictEqual(
    unmatched.status,
    "registry_not_found_in_current_dataset"
  );

  assert.strictEqual(
    unmatched.registryMatch,
    null
  );

  console.log(
    "Candidate Registry Reconciler test PASSED."
  );
})().catch(error => {
  console.error(error);
  process.exit(1);
});
