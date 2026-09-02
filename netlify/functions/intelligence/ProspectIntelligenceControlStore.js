const crypto =
  require("crypto");

const DEFAULT_CACHE_TTL_MS =
  5 * 60 * 1000;

const DEFAULT_MINUTE_LIMIT =
  10;

const DEFAULT_DAY_LIMIT =
  50;

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

class ProspectIntelligenceControlStore {
  constructor({
    db,
    now =
      () =>
        new Date(),

    cacheTtlMs =
      DEFAULT_CACHE_TTL_MS,

    minuteLimit =
      DEFAULT_MINUTE_LIMIT,

    dayLimit =
      DEFAULT_DAY_LIMIT
  } = {}) {
    if (
      !db ||
      typeof db.collection !==
        "function" ||
      typeof db.runTransaction !==
        "function"
    ) {
      throw new Error(
        "ProspectIntelligenceControlStore requires Firestore."
      );
    }

    this.db =
      db;

    this.now =
      now;

    this.cacheTtlMs =
      Math.max(
        1000,
        Number(cacheTtlMs) ||
          DEFAULT_CACHE_TTL_MS
      );

    this.minuteLimit =
      Math.max(
        1,
        Number(minuteLimit) ||
          DEFAULT_MINUTE_LIMIT
      );

    this.dayLimit =
      Math.max(
        1,
        Number(dayLimit) ||
          DEFAULT_DAY_LIMIT
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

      error.statusCode = 400;

      throw error;
    }

    return clean;
  }

  getUserRoot(
    uid
  ) {
    return this.db
      .collection(
        "prospect_intelligence_control"
      )
      .doc(uid);
  }

  getReferences({
    uid,
    idempotencyKey,
    requestHash,
    now
  }) {
    const root =
      this.getUserRoot(
        uid
      );

    const idempotencyHash =
      hashValue(
        `${uid}:${idempotencyKey}`
      );

    const scopedRequestHash =
      hashValue(
        `${uid}:${requestHash}`
      );

    const minuteWindow =
      now
        .toISOString()
        .slice(0, 16)
        .replace(
          /[-:T]/g,
          ""
        );

    const dayWindow =
      now
        .toISOString()
        .slice(0, 10)
        .replace(
          /-/g,
          ""
        );

    return {
      idempotencyHash,
      scopedRequestHash,

      idempotencyRef:
        root
          .collection(
            "idempotency"
          )
          .doc(
            idempotencyHash
          ),

      requestRef:
        root
          .collection(
            "request_cache"
          )
          .doc(
            scopedRequestHash
          ),

      minuteRef:
        root
          .collection(
            "rate_windows"
          )
          .doc(
            `minute_${minuteWindow}`
          ),

      dayRef:
        root
          .collection(
            "rate_windows"
          )
          .doc(
            `day_${dayWindow}`
          )
    };
  }

  isActive(
    record,
    now
  ) {
    if (!record) {
      return false;
    }

    const expiresAt =
      asDate(
        record.expiresAt
      );

    return Boolean(
      expiresAt &&
      expiresAt.getTime() >
        now.getTime()
    );
  }

  async lookupCachedResponse({
    uid,
    idempotencyKey,
    requestHash
  } = {}) {
    const cleanUid =
      this.requireString(
        uid,
        "uid"
      );

    const cleanKey =
      this.requireString(
        idempotencyKey,
        "idempotencyKey"
      );

    const cleanRequestHash =
      this.requireString(
        requestHash,
        "requestHash"
      );

    const now =
      this.now();

    const refs =
      this.getReferences({
        uid:
          cleanUid,

        idempotencyKey:
          cleanKey,

        requestHash:
          cleanRequestHash,

        now
      });

    const [
      idempotencySnapshot,
      requestSnapshot
    ] =
      await Promise.all([
        refs.idempotencyRef.get(),
        refs.requestRef.get()
      ]);

    const idempotencyRecord =
      idempotencySnapshot.exists
        ? idempotencySnapshot.data()
        : null;

    if (
      this.isActive(
        idempotencyRecord,
        now
      )
    ) {
      if (
        idempotencyRecord
          .requestHash !==
        cleanRequestHash
      ) {
        const error =
          new Error(
            "Idempotency-Key was already used for a different request."
          );

        error.statusCode =
          409;

        throw error;
      }

      if (
        idempotencyRecord.status ===
          "COMPLETED" &&
        idempotencyRecord.response
      ) {
        console.log(
          "Prospect intelligence cache hit:",
          {
            cacheType:
              "IDEMPOTENCY"
          }
        );

        return {
          disposition:
            "CACHED",

          response:
            idempotencyRecord
              .response
        };
      }
    }

    const requestRecord =
      requestSnapshot.exists
        ? requestSnapshot.data()
        : null;

    if (
      this.isActive(
        requestRecord,
        now
      ) &&
      requestRecord.status ===
        "COMPLETED" &&
      requestRecord.response
    ) {
      console.log(
        "Prospect intelligence cache hit:",
        {
          cacheType:
            "REQUEST_HASH"
        }
      );

      return {
        disposition:
          "CACHED",

        response:
          requestRecord.response
      };
    }

    return {
      disposition:
        "MISS"
    };
  }

  async beginRequest({
    uid,
    idempotencyKey,
    requestHash
  } = {}) {
    const cleanUid =
      this.requireString(
        uid,
        "uid"
      );

    const cleanKey =
      this.requireString(
        idempotencyKey,
        "idempotencyKey"
      );

    const cleanRequestHash =
      this.requireString(
        requestHash,
        "requestHash"
      );

    const now =
      this.now();

    const expiresAt =
      new Date(
        now.getTime() +
        this.cacheTtlMs
      );

    const refs =
      this.getReferences({
        uid:
          cleanUid,

        idempotencyKey:
          cleanKey,

        requestHash:
          cleanRequestHash,

        now
      });

    const transactionStartedAt =
      Date.now();

    const result =
      await this.db
        .runTransaction(
        async transaction => {
          const [
            idempotencySnapshot,
            requestSnapshot,
            minuteSnapshot,
            daySnapshot
          ] =
            await Promise.all([
              transaction.get(
                refs.idempotencyRef
              ),

              transaction.get(
                refs.requestRef
              ),

              transaction.get(
                refs.minuteRef
              ),

              transaction.get(
                refs.dayRef
              )
            ]);

          const idempotencyRecord =
            idempotencySnapshot.exists
              ? idempotencySnapshot.data()
              : null;

          if (
            this.isActive(
              idempotencyRecord,
              now
            )
          ) {
            if (
              idempotencyRecord
                .requestHash !==
              cleanRequestHash
            ) {
              const error =
                new Error(
                  "Idempotency-Key was already used for a different request."
                );

              error.statusCode =
                409;

              throw error;
            }

            if (
              idempotencyRecord.status ===
                "COMPLETED" &&
              idempotencyRecord.response
            ) {
              console.log(
                "Prospect intelligence cache hit:",
                {
                  cacheType:
                    "IDEMPOTENCY"
                }
              );

              return {
                disposition:
                  "CACHED",

                response:
                  idempotencyRecord
                    .response
              };
            }

            if (
              idempotencyRecord.status ===
                "IN_PROGRESS"
            ) {
              return {
                disposition:
                  "IN_PROGRESS"
              };
            }
          }

          const requestRecord =
            requestSnapshot.exists
              ? requestSnapshot.data()
              : null;

          if (
            this.isActive(
              requestRecord,
              now
            )
          ) {
            if (
              requestRecord.status ===
                "COMPLETED" &&
              requestRecord.response
            ) {
              console.log(
                "Prospect intelligence cache hit:",
                {
                  cacheType:
                    "REQUEST_HASH"
                }
              );

              transaction.set(
                refs.idempotencyRef,
                {
                  uid:
                    cleanUid,

                  requestHash:
                    cleanRequestHash,

                  status:
                    "COMPLETED",

                  response:
                    requestRecord.response,

                  createdAt:
                    now,

                  expiresAt
                }
              );

              return {
                disposition:
                  "CACHED",

                response:
                  requestRecord
                    .response
              };
            }

            if (
              requestRecord.status ===
                "IN_PROGRESS"
            ) {
              return {
                disposition:
                  "IN_PROGRESS"
              };
            }
          }

          const minuteRecord =
            minuteSnapshot.exists
              ? minuteSnapshot.data()
              : {};

          const dayRecord =
            daySnapshot.exists
              ? daySnapshot.data()
              : {};

          const minuteCount =
            Number(
              minuteRecord.count
            ) || 0;

          const dayCount =
            Number(
              dayRecord.count
            ) || 0;

          if (
            minuteCount >=
              this.minuteLimit ||
            dayCount >=
              this.dayLimit
          ) {
            const error =
              new Error(
                "Prospect intelligence rate limit exceeded."
              );

            error.statusCode =
              429;

            throw error;
          }

          transaction.set(
            refs.minuteRef,
            {
              uid:
                cleanUid,

              count:
                minuteCount + 1,

              windowType:
                "MINUTE",

              updatedAt:
                now,

              expiresAt:
                new Date(
                  now.getTime() +
                  2 * 60 * 1000
                )
            }
          );

          transaction.set(
            refs.dayRef,
            {
              uid:
                cleanUid,

              count:
                dayCount + 1,

              windowType:
                "DAY",

              updatedAt:
                now,

              expiresAt:
                new Date(
                  now.getTime() +
                  2 *
                  24 *
                  60 *
                  60 *
                  1000
                )
            }
          );

          const controlRecord = {
            uid:
              cleanUid,

            requestHash:
              cleanRequestHash,

            status:
              "IN_PROGRESS",

            createdAt:
              now,

            expiresAt
          };

          transaction.set(
            refs.idempotencyRef,
            controlRecord
          );

          transaction.set(
            refs.requestRef,
            controlRecord
          );

          return {
            disposition:
              "CLAIMED"
          };
        }
      );

    console.log(
      "Prospect intelligence control transaction timing:",
      {
        elapsedMs:
          Date.now() -
          transactionStartedAt,

        disposition:
          result?.disposition ||
          null
      }
    );

    return result;
  }

  async completeRequest({
    uid,
    idempotencyKey,
    requestHash,
    response
  } = {}) {
    const cleanUid =
      this.requireString(
        uid,
        "uid"
      );

    const cleanKey =
      this.requireString(
        idempotencyKey,
        "idempotencyKey"
      );

    const cleanRequestHash =
      this.requireString(
        requestHash,
        "requestHash"
      );

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

      error.statusCode = 500;

      throw error;
    }

    const now =
      this.now();

    const expiresAt =
      new Date(
        now.getTime() +
        this.cacheTtlMs
      );

    const refs =
      this.getReferences({
        uid:
          cleanUid,

        idempotencyKey:
          cleanKey,

        requestHash:
          cleanRequestHash,

        now
      });

    const completedRecord = {
      uid:
        cleanUid,

      requestHash:
        cleanRequestHash,

      status:
        "COMPLETED",

      response,

      completedAt:
        now,

      expiresAt
    };

    await this.db
      .runTransaction(
        async transaction => {
          transaction.set(
            refs.idempotencyRef,
            completedRecord
          );

          transaction.set(
            refs.requestRef,
            completedRecord
          );
        }
      );

    return response;
  }

  async failRequest({
    uid,
    idempotencyKey,
    requestHash
  } = {}) {
    const cleanUid =
      this.requireString(
        uid,
        "uid"
      );

    const cleanKey =
      this.requireString(
        idempotencyKey,
        "idempotencyKey"
      );

    const cleanRequestHash =
      this.requireString(
        requestHash,
        "requestHash"
      );

    const now =
      this.now();

    const refs =
      this.getReferences({
        uid:
          cleanUid,

        idempotencyKey:
          cleanKey,

        requestHash:
          cleanRequestHash,

        now
      });

    const failedRecord = {
      uid:
        cleanUid,

      requestHash:
        cleanRequestHash,

      status:
        "FAILED",

      failedAt:
        now,

      expiresAt:
        now
    };

    await this.db
      .runTransaction(
        async transaction => {
          transaction.set(
            refs.idempotencyRef,
            failedRecord
          );

          transaction.set(
            refs.requestRef,
            failedRecord
          );
        }
      );
  }
}

module.exports = {
  DEFAULT_CACHE_TTL_MS,
  DEFAULT_MINUTE_LIMIT,
  DEFAULT_DAY_LIMIT,
  ProspectIntelligenceControlStore,
  _test: {
    cleanString,
    hashValue,
    asDate
  }
};
