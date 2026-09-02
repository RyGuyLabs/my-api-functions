const assert =
  require("assert");

const {
  ProspectIntelligenceJobStore,
  buildJobId
} = require(
  "./ProspectIntelligenceJobStore.js"
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

  async set(
    value,
    options = {}
  ) {
    if (
      options.merge
    ) {
      const existing =
        this.db.records.get(
          this.path
        ) || {};

      this.db.records.set(
        this.path,
        {
          ...existing,
          ...value
        }
      );

      return;
    }

    this.db.records.set(
      this.path,
      value
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
  }

  collection(
    name
  ) {
    return new FakeCollectionReference(
      this,
      name
    );
  }
}

(async () => {
  console.log(
    "1. job store requires Firestore"
  );

  assert.throws(
    () =>
      new ProspectIntelligenceJobStore(),
    /requires Firestore/
  );

  console.log(
    "2. job ID is deterministic by UID and request hash"
  );

  const jobIdA =
    buildJobId({
      uid:
        "user-123",

      requestHash:
        "request-A"
    });

  const jobIdB =
    buildJobId({
      uid:
        "user-123",

      requestHash:
        "request-A"
    });

  assert.strictEqual(
    jobIdA,
    jobIdB
  );

  const db =
    new FakeFirestore();

  let currentTime =
    new Date(
      "2026-09-01T18:00:00.000Z"
    );

  const store =
    new ProspectIntelligenceJobStore({
      db,

      now:
        () =>
          new Date(
            currentTime
          )
    });

  console.log(
    "3. cache miss creates a PENDING operational job"
  );

  const created =
    await store.createPendingJob({
      uid:
        "user-123",

      requestHash:
        "request-A",

      idempotencyKey:
        "idem-001",

      request: {
        prospectKey:
          "prospect-123"
      }
    });

  assert.strictEqual(
    created.created,
    true
  );

  assert.strictEqual(
    created.job.status,
    "PENDING"
  );

  console.log(
    "4. same effective request reuses the same active job"
  );

  const duplicate =
    await store.createPendingJob({
      uid:
        "user-123",

      requestHash:
        "request-A",

      idempotencyKey:
        "idem-002",

      request: {
        prospectKey:
          "prospect-123"
      }
    });

  assert.strictEqual(
    duplicate.created,
    false
  );

  assert.strictEqual(
    duplicate.jobId,
    created.jobId
  );

  console.log(
    "5. job ownership is UID scoped"
  );

  const invisible =
    await store.getJob({
      uid:
        "different-user",

      jobId:
        created.jobId
    });

  assert.strictEqual(
    invisible,
    null
  );

  console.log(
    "6. job can transition to RUNNING"
  );

  await store.markRunning({
    uid:
      "user-123",

    jobId:
      created.jobId
  });

  const running =
    await store.getJob({
      uid:
        "user-123",

      jobId:
        created.jobId
    });

  assert.strictEqual(
    running.status,
    "RUNNING"
  );

  console.log(
    "7. job can transition to COMPLETED with normalized response"
  );

  await store.markCompleted({
    uid:
      "user-123",

    jobId:
      created.jobId,

    response: {
      status:
        "success",

      brief: {
        briefVersion:
          "1.0"
      }
    }
  });

  const completed =
    await store.getJob({
      uid:
        "user-123",

      jobId:
        created.jobId
    });

  assert.strictEqual(
    completed.status,
    "COMPLETED"
  );

  assert.strictEqual(
    completed.response
      .brief
      .briefVersion,
    "1.0"
  );

  console.log(
    "8. failed jobs expose sanitized operational failure state"
  );

  const failedCreated =
    await store.createPendingJob({
      uid:
        "user-123",

      requestHash:
        "request-B",

      idempotencyKey:
        "idem-003",

      request: {
        prospectKey:
          "prospect-456"
      }
    });

  await store.markFailed({
    uid:
      "user-123",

    jobId:
      failedCreated.jobId,

    errorMessage:
      "Generation failed."
  });

  const failed =
    await store.getJob({
      uid:
        "user-123",

      jobId:
        failedCreated.jobId
    });

  assert.strictEqual(
    failed.status,
    "FAILED"
  );

  assert.strictEqual(
    failed.error,
    "Generation failed."
  );

  console.log(
    "Prospect Intelligence Job Store test PASSED."
  );
})().catch(error => {
  console.error(error);
  process.exit(1);
});
