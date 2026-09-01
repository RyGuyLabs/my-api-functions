const assert =
  require("assert");

const {
  CustomerProspectStateStore
} = require(
  "./CustomerProspectStateStore.js"
);

const writes = [];

function fakeDoc(
  path
) {
  return {
    collection(name) {
      return fakeDoc(
        `${path}/${name}`
      );
    },

    doc(name) {
      return fakeDoc(
        `${path}/${name}`
      );
    },

    async set(
      value,
      options
    ) {
      writes.push({
        path,
        value,
        options
      });
    }
  };
}

const fakeDb = {
  collection(name) {
    return fakeDoc(
      name
    );
  }
};

const store =
  new CustomerProspectStateStore({
    db:
      fakeDb,

    serverTimestamp:
      () => "SERVER_TIMESTAMP"
  });

(async () => {
  console.log(
    "1. registration ID is the strongest prospect identity"
  );

  const registrationIdentity =
    store.buildIdentity({
      registrationId:
        " l26000123456 ",
      candidateDomain:
        "example.com",
      prospectName:
        "Example LLC"
    });

  assert.deepStrictEqual(
    registrationIdentity,
    {
      type:
        "registration_id",
      value:
        "L26000123456"
    }
  );

  console.log(
    "2. domain is used when registry identity is unavailable"
  );

  const domainIdentity =
    store.buildIdentity({
      candidateDomain:
        "www.TampaBaySolar.com"
    });

  assert.deepStrictEqual(
    domainIdentity,
    {
      type:
        "domain",
      value:
        "tampabaysolar.com"
    }
  );

  console.log(
    "3. normalized prospect name is the final identity fallback"
  );

  const nameIdentity =
    store.buildIdentity({
      prospectName:
        " George G. Solar & Co. "
    });

  assert.deepStrictEqual(
    nameIdentity,
    {
      type:
        "prospect_name",
      value:
        "george g solar and co"
    }
  );

  console.log(
    "4. equivalent prospect identity produces the same deterministic key"
  );

  const firstKey =
    store.buildProspectKey({
      candidateDomain:
        "https://www.tampabaysolar.com/"
    });

  const secondKey =
    store.buildProspectKey({
      candidateDomain:
        "tampabaysolar.com"
    });

  assert.strictEqual(
    firstKey.prospectKey,
    secondKey.prospectKey
  );

  console.log(
    "5. qualification state is customer-specific and normalized"
  );

  const record =
    store.buildStateRecord({
      uid:
        " user-123 ",

      prospect: {
        prospectName:
          "Tampa Bay Solar",
        candidateName:
          "Tampa Bay Solar",
        candidateDomain:
          "www.tampabaysolar.com",
        website:
          "https://tampabaysolar.com/"
      },

      qualification: {
        status:
          "QUALIFIED",
        priority:
          "HIGH",
        estimatedValue:
          "25000",
        timing:
          "30 days",
        nextAction:
          "Call owner",
        followUpDate:
          "2026-09-15",
        contactName:
          "Jane Doe",
        contactRole:
          "Owner",
        notes:
          "Strong local fit."
      }
    });

  assert.strictEqual(
    record.customerUid,
    "user-123"
  );

  assert.strictEqual(
    record.identity.type,
    "domain"
  );

  assert.strictEqual(
    record.salesState
      .estimatedValue,
    25000
  );

  assert.strictEqual(
    record.salesState
      .priority,
    "HIGH"
  );

  console.log(
    "6. negative estimated value is rejected"
  );

  assert.throws(
    () =>
      store.buildStateRecord({
        uid:
          "user-123",

        prospect: {
          prospectName:
            "Test Prospect"
        },

        qualification: {
          estimatedValue:
            -1
        }
      }),
    /non-negative number/
  );

  console.log(
    "7. save writes beneath the authenticated customer's namespace"
  );

  writes.length = 0;

  const saved =
    await store.saveQualification({
      uid:
        "user-123",

      prospect: {
        prospectName:
          "Tampa Bay Solar",
        candidateDomain:
          "tampabaysolar.com",
        website:
          "https://tampabaysolar.com/"
      },

      qualification: {
        status:
          "QUALIFIED",
        priority:
          "HIGH"
      }
    });

  assert.strictEqual(
    writes.length,
    1
  );

  assert.strictEqual(
    writes[0].path,
    `customer_prospect_state/user-123/prospects/${saved.prospectKey}`
  );

  assert.strictEqual(
    writes[0].options.merge,
    true
  );

  assert.strictEqual(
    writes[0].value
      .customerUid,
    "user-123"
  );

  assert.strictEqual(
    writes[0].value
      .updatedAt,
    "SERVER_TIMESTAMP"
  );

  console.log(
    "Customer Prospect State Store test PASSED."
  );
})().catch(error => {
  console.error(error);
  process.exit(1);
});
