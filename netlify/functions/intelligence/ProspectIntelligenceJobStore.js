const crypto =
  require("crypto");

const DEFAULT_JOB_TTL_MS =
  30 * 60 * 1000;

const VALID_JOB_STATUSES =
  new Set([
    "PENDING",
    "RUNNING",
    "COMPLETED",
    "FAILED"
  ]);

function cleanString(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const clean =
    String(value)
      .replace(/\s+/g, " ")
      .trim();

  return clean || null;
}

function hashValue(
  value
) {
  return crypto
    .createHash("sha256")
    .update(
      String(value)
    )
    .digest("hex");
}

function buildJobId({
  uid,
  requestHash
} = {}) {
  const cleanUid =
    cleanString(
      uid
    );

  const cleanRequestHash =
    cleanString(
      requestHash
    );

  if (
    !cleanUid ||
    !cleanRequestHash
  ) {
    throw new Error(
      "uid and requestHash are required to build a job ID."
    );
  }

  return hashValue(
    `${cleanUid}:${cleanRequestHash}`
  ).slice(
    0,
    40
  );
}

function asDate(
  value
) {
  if (!value) {
    return null;
  }

  if (
    value instanceof Date
  ) {
    return value;
  }

  if (
    typeof value.toDate ===
      "function"
  ) {
    return value.toDate();
  }

  const parsed =
    new Date(value);

  return Number.isNaN(
    parsed.getTime()
  )
    ? null
    : parsed;
}

class ProspectIntelligenceJobStore {
  constructor({
    db,
    now =
      () =>
        new Date(),

    jobTtlMs =
      DEFAULT_JOB_TTL_MS
  } = {}) {
    if (
      !db ||
      typeof db.collection !==
        "function"
    ) {
      throw new Error(
        "ProspectIntelligenceJobStore requires Firestore."
      );
    }

    this.db =
      db;

    this.now =
      now;

    this.jobTtlMs =
      Math.max(
        5 * 60 * 1000,
        Number(jobTtlMs) ||
          DEFAULT_JOB_TTL_MS
      );
  }

  requireString(
    value,
    fieldName
  ) {
    const clean =
      cleanString(
        value
      );

    if (!clean) {
      const error =
        new Error(
          `${fieldName} is required.`
        );

      error.statusCode =
        400;

      throw error;
    }

    return clean;
  }

  getJobRef(
    jobId
  ) {
    return this.db
      .collection(
        "prospect_intelligence_jobs"
      )
      .doc(jobId);
  }

  async createPendingJob({
    uid,
    requestHash,
    idempotencyKey,
    request
  } = {}) {
    const cleanUid =
      this.requireString(
        uid,
        "uid"
      );

    const cleanRequestHash =
      this.requireString(
        requestHash,
        "requestHash"
      );

    const cleanKey =
      this.requireString(
        idempotencyKey,
        "idempotencyKey"
      );

    if (
      !request ||
      typeof request !==
        "object" ||
      Array.isArray(request)
    ) {
      const error =
        new Error(
          "request must be an object."
        );

      error.statusCode =
        400;

      throw error;
    }

    const jobId =
      buildJobId({
        uid:
          cleanUid,

        requestHash:
          cleanRequestHash
      });

    const now =
      this.now();

    const expiresAt =
      new Date(
        now.getTime() +
        this.jobTtlMs
      );

    const ref =
      this.getJobRef(
        jobId
      );

    const existing =
      await ref.get();

    if (
      existing.exists
    ) {
      const record =
        existing.data();

      const existingExpiresAt =
        asDate(
          record.expiresAt
        );

      if (
        existingExpiresAt &&
        existingExpiresAt.getTime() >
          now.getTime() &&
        (
          record.status ===
            "PENDING" ||
          record.status ===
            "RUNNING"
        )
      ) {
        return {
          jobId,
          created:
            false,
          job:
            record
        };
      }
    }

    const record = {
      jobId,

      uid:
        cleanUid,

      requestHash:
        cleanRequestHash,

      idempotencyKey:
        cleanKey,

      status:
        "PENDING",

      request,

      createdAt:
        now,

      updatedAt:
        now,

      expiresAt,

      response:
        null,

      error:
        null
    };

    await ref.set(
      record
    );

    return {
      jobId,
      created:
        true,
      job:
        record
    };
  }

  async getJob({
    uid,
    jobId
  } = {}) {
    const cleanUid =
      this.requireString(
        uid,
        "uid"
      );

    const cleanJobId =
      this.requireString(
        jobId,
        "jobId"
      );

    const snapshot =
      await this
        .getJobRef(
          cleanJobId
        )
        .get();

    if (
      !snapshot.exists
    ) {
      return null;
    }

    const job =
      snapshot.data();

    if (
      job.uid !==
        cleanUid
    ) {
      return null;
    }

    const expiresAt =
      asDate(
        job.expiresAt
      );

    if (
      !expiresAt ||
      expiresAt.getTime() <=
        this.now().getTime()
    ) {
      return null;
    }

    return job;
  }

  async markRunning({
    uid,
    jobId
  } = {}) {
    return this.updateStatus({
      uid,
      jobId,
      status:
        "RUNNING"
    });
  }

  async markCompleted({
    uid,
    jobId,
    response
  } = {}) {
    if (
      !response ||
      typeof response !==
        "object" ||
      Array.isArray(response)
    ) {
      const error =
        new Error(
          "response must be an object."
        );

      error.statusCode =
        500;

      throw error;
    }

    return this.updateStatus({
      uid,
      jobId,
      status:
        "COMPLETED",
      response,
      error:
        null
    });
  }

  async markFailed({
    uid,
    jobId,
    errorMessage
  } = {}) {
    return this.updateStatus({
      uid,
      jobId,
      status:
        "FAILED",
      response:
        null,
      error:
        cleanString(
          errorMessage
        ) ||
        "Prospect intelligence generation failed."
    });
  }

  async updateStatus({
    uid,
    jobId,
    status,
    response,
    error
  } = {}) {
    const cleanUid =
      this.requireString(
        uid,
        "uid"
      );

    const cleanJobId =
      this.requireString(
        jobId,
        "jobId"
      );

    const cleanStatus =
      this.requireString(
        status,
        "status"
      )
        .toUpperCase();

    if (
      !VALID_JOB_STATUSES.has(
        cleanStatus
      )
    ) {
      const statusError =
        new Error(
          "Unsupported prospect intelligence job status."
        );

      statusError.statusCode =
        400;

      throw statusError;
    }

    const ref =
      this.getJobRef(
        cleanJobId
      );

    const snapshot =
      await ref.get();

    if (
      !snapshot.exists
    ) {
      const notFound =
        new Error(
          "Prospect intelligence job was not found."
        );

      notFound.statusCode =
        404;

      throw notFound;
    }

    const existing =
      snapshot.data();

    if (
      existing.uid !==
        cleanUid
    ) {
      const forbidden =
        new Error(
          "Prospect intelligence job was not found."
        );

      forbidden.statusCode =
        404;

      throw forbidden;
    }

    const now =
      this.now();

    const patch = {
      status:
        cleanStatus,

      updatedAt:
        now
    };

    if (
      response !==
        undefined
    ) {
      patch.response =
        response;
    }

    if (
      error !==
        undefined
    ) {
      patch.error =
        error;
    }

    if (
      cleanStatus ===
        "COMPLETED"
    ) {
      patch.completedAt =
        now;
    }

    if (
      cleanStatus ===
        "FAILED"
    ) {
      patch.failedAt =
        now;
    }

    await ref.set(
      patch,
      {
        merge:
          true
      }
    );

    return {
      ...existing,
      ...patch
    };
  }
}

module.exports = {
  DEFAULT_JOB_TTL_MS,
  VALID_JOB_STATUSES,
  ProspectIntelligenceJobStore,
  buildJobId,
  _test: {
    cleanString,
    hashValue,
    asDate
  }
};
