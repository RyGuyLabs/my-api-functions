const assert =
  require("assert");

const {
  ProspectIntelligenceControlStore
} = require(
  "./ProspectIntelligenceControlStore.js"
);

class FakeSnapshot {
  constructor(
    value
  ) {
    this.value =
      value;
  }

  get exists() {
    return (
      this.value !==
      undefined
    );
  }

  data() {
    return this.value;
  }
}

class FakeDocumentReference {
  constructor(
    db,
    path
  ) {
    this.db =
      db;

    this.path =
      path;
  }

  async get() {
    return new FakeSnapshot(
      this.db.records.get(
        this.path
      )
    );
  }

  collection(
    name
  ) {
    return new FakeCollectionReference(
      this.db,
      `${this.path}/${name}`
    );
  }
}

class FakeCollectionReference {
  constructor(
    db,
    path
  ) {
    this.db =
      db;

    this.path =
      path;
  }

  doc(
    id
  ) {
    return new FakeDocumentReference(
      this.db,
      `${this.path}/${id}`
    );
  }
}

class FakeFirestore {
  constructor() {
    this.records =
      new Map();

    this.transactionCount =
      0;
  }

  collection(
    name
  ) {
    return new FakeCollectionReference(
      this,
      name
    );
  }

  async runTransaction(
    callback
  ) {
    this.transactionCount +=
      1;

    const db =
      this;

    const transaction = {
      async get(
        ref
      ) {
        return new FakeSnapshot(
          db.records.get(
            ref.path
          )
        );
      },

      set(
        ref,
        value
      ) {
        db.records.set(
          ref.path,
          value
        );
      }
    };

    return callback(
      transaction
    );
  }
}

(async () => {
  console.log(
    "1. control store requires Firestore"
  );

  assert.throws(
    () =>
      new ProspectIntelligenceControlStore(),
    /requires Firestore/
  );

  const db =
    new FakeFirestore();

  let currentTime =
    new Date(
      "2026-09-01T18:00:00.000Z"
    );

  const store =
    new ProspectIntelligenceControlStore({
      db,

      now:
        () =>
          new Date(
            currentTime
          ),

      cacheTtlMs:
        5 * 60 * 1000,

      minuteLimit:
        2,

      dayLimit:
        4
    });

  console.log(
    "2. first request claims execution"
  );

  const first =
    await store.beginRequest({
      uid:
        "user-123",

      idempotencyKey:
        "idem-001",

      requestHash:
        "request-A"
    });

  assert.strictEqual(
    first.disposition,
    "CLAIMED"
  );

  console.log(
    "3. same in-flight idempotency key does not execute twice"
  );

  const duplicateInFlight =
    await store.beginRequest({
      uid:
        "user-123",

      idempotencyKey:
        "idem-001",

      requestHash:
        "request-A"
    });

  assert.strictEqual(
    duplicateInFlight
      .disposition,
    "IN_PROGRESS"
  );

  console.log(
    "4. same idempotency key cannot represent a different request"
  );

  await assert.rejects(
    () =>
      store.beginRequest({
        uid:
          "user-123",

        idempotencyKey:
          "idem-001",

        requestHash:
          "request-B"
      }),
    /different request/
  );

  console.log(
    "5. completed request is replayable without new execution"
  );

  const cachedResponse = {
    ok:
      true,

    brief: {
      briefVersion:
        "1.0"
    }
  };

  await store.completeRequest({
    uid:
      "user-123",

    idempotencyKey:
      "idem-001",

    requestHash:
      "request-A",

    response:
      cachedResponse
  });

  const replay =
    await store.beginRequest({
      uid:
        "user-123",

      idempotencyKey:
        "idem-001",

      requestHash:
        "request-A"
    });

  assert.strictEqual(
    replay.disposition,
    "CACHED"
  );

  assert.deepStrictEqual(
    replay.response,
    cachedResponse
  );

  console.log(
    "6. new key for same effective request reuses short-lived cache"
  );

  const transactionCountBeforeCacheHit =
    db.transactionCount;

  const sameRequestNewKey =
    await store.beginRequest({
      uid:
        "user-123",

      idempotencyKey:
        "idem-002",

      requestHash:
        "request-A"
    });

  assert.strictEqual(
    sameRequestNewKey
      .disposition,
    "CACHED"
  );

  assert.strictEqual(
    db.transactionCount,
    transactionCountBeforeCacheHit +
      1
  );

  console.log(
    "6a. request-hash cache binds the new idempotency key"
  );

  await assert.rejects(
    () =>
      store.beginRequest({
        uid:
          "user-123",

        idempotencyKey:
          "idem-002",

        requestHash:
          "request-B"
      }),

    error =>
      error &&
      error.statusCode ===
        409 &&
      /different request/i.test(
        error.message
      )
  );

  console.log(
    "7. UID scope prevents cross-user idempotency collisions"
  );

  const otherUser =
    await store.beginRequest({
      uid:
        "user-456",

      idempotencyKey:
        "idem-001",

      requestHash:
        "request-A"
    });

  assert.strictEqual(
    otherUser.disposition,
    "CLAIMED"
  );

  console.log(
    "8. genuinely new requests count against the UID rate limit"
  );

  const secondUnique =
    await store.beginRequest({
      uid:
        "rate-user",

      idempotencyKey:
        "rate-001",

      requestHash:
        "rate-request-1"
    });

  assert.strictEqual(
    secondUnique.disposition,
    "CLAIMED"
  );

  const thirdUnique =
    await store.beginRequest({
      uid:
        "rate-user",

      idempotencyKey:
        "rate-002",

      requestHash:
        "rate-request-2"
    });

  assert.strictEqual(
    thirdUnique.disposition,
    "CLAIMED"
  );

  await assert.rejects(
    () =>
      store.beginRequest({
        uid:
          "rate-user",

        idempotencyKey:
          "rate-003",

        requestHash:
          "rate-request-3"
      }),
    /rate limit exceeded/
  );

  console.log(
    "9. failed execution releases the request for retry"
  );

  await store.failRequest({
    uid:
      "user-456",

    idempotencyKey:
      "idem-001",

    requestHash:
      "request-A"
  });

  const retryAfterFailure =
    await store.beginRequest({
      uid:
        "user-456",

      idempotencyKey:
        "idem-003",

      requestHash:
        "request-A"
    });

  assert.strictEqual(
    retryAfterFailure
      .disposition,
    "CLAIMED"
  );

  console.log(
    "10. read-only cache lookup does not create a new transaction"
  );

  const transactionsBeforeLookup =
    db.transactionCount;

  const readOnlyCache =
    await store.lookupCachedResponse({
      uid:
        "user-123",

      idempotencyKey:
        "idem-read-cache",

      requestHash:
        "request-A"
    });

  assert.strictEqual(
    readOnlyCache.disposition,
    "CACHED"
  );

  assert.strictEqual(
    db.transactionCount,
    transactionsBeforeLookup
  );

  console.log(
    "11. read-only cache miss does not claim execution"
  );

  const transactionsBeforeMiss =
    db.transactionCount;

  const readOnlyMiss =
    await store.lookupCachedResponse({
      uid:
        "user-123",

      idempotencyKey:
        "idem-read-miss",

      requestHash:
        "request-never-seen"
    });

  assert.strictEqual(
    readOnlyMiss.disposition,
    "MISS"
  );

  assert.strictEqual(
    db.transactionCount,
    transactionsBeforeMiss
  );

  console.log(
    "12. read-only lookup preserves idempotency conflict detection"
  );

  await assert.rejects(
    () =>
      store.lookupCachedResponse({
        uid:
          "user-123",

        idempotencyKey:
          "idem-002",

        requestHash:
          "different-request"
      }),

    error =>
      error &&
      error.statusCode ===
        409
  );

  console.log(
    "Prospect Intelligence Control Store test PASSED."
  );
})().catch(error => {
  console.error(error);
  process.exit(1);
});
