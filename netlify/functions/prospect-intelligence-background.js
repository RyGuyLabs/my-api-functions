const crypto =
  require("crypto");

const admin =
  require("firebase-admin");

const {
  buildProspectIntelligenceRequest
} = require(
  "./intelligence/ProspectIntelligenceRequest.js"
);

const {
  ProspectIntelligenceService
} = require(
  "./intelligence/ProspectIntelligenceService.js"
);

const {
  ProspectIntelligenceControlStore
} = require(
  "./intelligence/ProspectIntelligenceControlStore.js"
);

const {
  ProspectIntelligenceJobStore,
  buildJobId
} = require(
  "./intelligence/ProspectIntelligenceJobStore.js"
);

const {
  GoogleCompanyResearchSearchProvider
} = require(
  "./intelligence/providers/GoogleCompanyResearchSearchProvider.js"
);

const {
  CurrentCompanyResearchProvider
} = require(
  "./intelligence/providers/CurrentCompanyResearchProvider.js"
);

const {
  GeminiProspectReasoningProvider
} = require(
  "./intelligence/providers/GeminiProspectReasoningProvider.js"
);

const ALLOWED_ORIGIN =
  "https://www.ryguylabs.com";

const MAX_BODY_BYTES =
  2048;

try {
  if (
    !admin.apps.length &&
    process.env
      .FIREBASE_SERVICE_ACCOUNT
  ) {
    admin.initializeApp({
      credential:
        admin.credential.cert(
          JSON.parse(
            process.env
              .FIREBASE_SERVICE_ACCOUNT
          )
        )
    });
  }
} catch (error) {
  console.error(
    "Prospect intelligence background Firebase initialization failed:",
    error.message
  );
}

function headers() {
  return {
    "Access-Control-Allow-Origin":
      ALLOWED_ORIGIN,

    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, Idempotency-Key",

    "Access-Control-Allow-Methods":
      "POST, OPTIONS",

    "Content-Type":
      "application/json"
  };
}

function jsonResponse(
  statusCode,
  payload
) {
  return {
    statusCode,

    headers:
      headers(),

    body:
      JSON.stringify(
        payload
      )
  };
}

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

function getBodyText(
  body
) {
  if (
    typeof body ===
      "string"
  ) {
    return body;
  }

  if (
    body === null ||
    body === undefined
  ) {
    return "";
  }

  return JSON.stringify(
    body
  );
}

function parseBody(
  body
) {
  const bodyText =
    getBodyText(
      body
    );

  if (
    Buffer.byteLength(
      bodyText,
      "utf8"
    ) >
      MAX_BODY_BYTES
  ) {
    const error =
      new Error(
        `Request body exceeds ${MAX_BODY_BYTES} byte limit.`
      );

    error.statusCode =
      413;

    throw error;
  }

  let parsed;

  try {
    parsed =
      typeof body ===
        "string"
        ? JSON.parse(body)
        : body;

  } catch {
    const error =
      new Error(
        "Invalid JSON request body."
      );

    error.statusCode =
      400;

    throw error;
  }

  if (
    !parsed ||
    typeof parsed !==
      "object" ||
    Array.isArray(parsed)
  ) {
    const error =
      new Error(
        "Request body must be a JSON object."
      );

    error.statusCode =
      400;

    throw error;
  }

  return parsed;
}

function validateRequest(
  body
) {
  try {
    return buildProspectIntelligenceRequest(
      body
    );

  } catch (error) {
    error.statusCode =
      400;

    throw error;
  }
}

function getBearerToken(
  event
) {
  const authorization =
    event?.headers?.authorization ||
    event?.headers?.Authorization;

  if (
    typeof authorization !==
      "string" ||
    !authorization.startsWith(
      "Bearer "
    )
  ) {
    return null;
  }

  return (
    authorization
      .substring(
        "Bearer ".length
      )
      .trim() ||
    null
  );
}

function getIdempotencyKey(
  event
) {
  const key =
    cleanString(
      event?.headers?.[
        "idempotency-key"
      ] ||
      event?.headers?.[
        "Idempotency-Key"
      ]
    );

  if (!key) {
    const error =
      new Error(
        "Idempotency-Key header is required."
      );

    error.statusCode =
      400;

    throw error;
  }

  if (
    key.length >
      200
  ) {
    const error =
      new Error(
        "Idempotency-Key is too long."
      );

    error.statusCode =
      400;

    throw error;
  }

  return key;
}

function canonicalize(
  value
) {
  if (
    value === null ||
    typeof value !==
      "object"
  ) {
    return value;
  }

  if (
    Array.isArray(value)
  ) {
    return value.map(
      canonicalize
    );
  }

  const output = {};

  for (
    const key
    of Object.keys(value)
      .sort()
  ) {
    output[key] =
      canonicalize(
        value[key]
      );
  }

  return output;
}

function buildRequestHash(
  normalizedRequest
) {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify(
        canonicalize(
          normalizedRequest
        )
      )
    )
    .digest("hex");
}

function buildResponsePayload(
  brief
) {
  return {
    status:
      "success",

    cached:
      false,

    brief,

    sources:
      Array.isArray(
        brief?.sources
      )
        ? brief.sources.map(
            source => ({
              title:
                source.title ||
                null,

              url:
                source.url,

              snippet:
                source.summary ||
                null,

              sourceType:
                source.sourceType ||
                null,

              sourceQuality:
                source.sourceQuality ||
                null,

              publishedAt:
                source.publishedAt ||
                null
            })
          )
        : []
  };
}

async function verifyFirebaseIdToken(
  idToken
) {
  if (!admin.apps.length) {
    throw new Error(
      "Firebase Admin is not initialized."
    );
  }

  return admin
    .auth()
    .verifyIdToken(
      idToken,
      true
    );
}

let runtimeJobStore =
  null;

function getRuntimeJobStore() {
  if (
    runtimeJobStore
  ) {
    return runtimeJobStore;
  }

  if (!admin.apps.length) {
    throw new Error(
      "Firebase Admin is not initialized."
    );
  }

  runtimeJobStore =
    new ProspectIntelligenceJobStore({
      db:
        admin.firestore()
    });

  return runtimeJobStore;
}

let runtimeControlStore =
  null;

function getRuntimeControlStore() {
  if (
    runtimeControlStore
  ) {
    return runtimeControlStore;
  }

  if (!admin.apps.length) {
    throw new Error(
      "Firebase Admin is not initialized."
    );
  }

  runtimeControlStore =
    new ProspectIntelligenceControlStore({
      db:
        admin.firestore()
    });

  return runtimeControlStore;
}

let runtimeService =
  null;

function getRuntimeService() {
  if (
    runtimeService
  ) {
    return runtimeService;
  }

  const researchSearchProvider =
    new GoogleCompanyResearchSearchProvider({
      timeoutMs:
        2500
    });

  const researchProvider =
    new CurrentCompanyResearchProvider({
      googleDiscoveryProvider:
        researchSearchProvider
    });

  const reasoningProvider =
    new GeminiProspectReasoningProvider({
      maxRetries:
        0,

      retryDelayMs:
        0,

      requestTimeoutMs:
        30000
    });

  runtimeService =
    new ProspectIntelligenceService({
      researchProvider,
      reasoningProvider
    });

  return runtimeService;
}

function createHandler({
  verifyIdToken =
    verifyFirebaseIdToken,

  getJobStore =
    getRuntimeJobStore,

  getControlStore =
    getRuntimeControlStore,

  getService =
    getRuntimeService
} = {}) {
  return async function handler(
    event
  ) {
    if (
      event?.httpMethod ===
        "OPTIONS"
    ) {
      return {
        statusCode:
          200,

        headers:
          headers(),

        body:
          ""
      };
    }

    if (
      !event ||
      event.httpMethod !==
        "POST"
    ) {
      return jsonResponse(
        405,
        {
          status:
            "error",

          error:
            "Method Not Allowed"
        }
      );
    }

    let requestBody;

    try {
      requestBody =
        parseBody(
          event.body
        );

    } catch (error) {
      return jsonResponse(
        error.statusCode ||
          400,

        {
          status:
            "error",

          error:
            error.message
        }
      );
    }

    const token =
      getBearerToken(
        event
      );

    if (!token) {
      return jsonResponse(
        401,
        {
          status:
            "error",

          error:
            "Authentication required."
        }
      );
    }

    let decodedUser;

    try {
      decodedUser =
        await verifyIdToken(
          token
        );

    } catch {
      return jsonResponse(
        401,
        {
          status:
            "error",

          error:
            "Invalid Firebase token."
        }
      );
    }

    if (
      !decodedUser?.uid
    ) {
      return jsonResponse(
        401,
        {
          status:
            "error",

          error:
            "Invalid Firebase token."
        }
      );
    }

    let idempotencyKey;
    let normalizedRequest;

    try {
      idempotencyKey =
        getIdempotencyKey(
          event
        );

      normalizedRequest =
        validateRequest(
          requestBody
        );

    } catch (error) {
      return jsonResponse(
        error.statusCode ||
          400,

        {
          status:
            "error",

          error:
            error.message
        }
      );
    }

    const uid =
      decodedUser.uid;

    const requestHash =
      buildRequestHash(
        normalizedRequest
      );

    const jobId =
      buildJobId({
        uid,
        requestHash
      });

    const controlStore =
      getControlStore();

    const jobStore =
      getJobStore();

    let claimed =
      false;

    try {
      const control =
        await controlStore
          .beginRequest({
            uid,
            idempotencyKey,
            requestHash
          });

      if (
        control.disposition ===
          "CACHED"
      ) {
        return jsonResponse(
          200,
          {
            status:
              "cached",

            jobId
          }
        );
      }

      if (
        control.disposition ===
          "IN_PROGRESS"
      ) {
        return jsonResponse(
          202,
          {
            status:
              "running",

            jobId
          }
        );
      }

      claimed =
        true;

      const jobResult =
        await jobStore
          .createPendingJob({
            uid,
            requestHash,
            idempotencyKey,
            request:
              requestBody
          });

      if (
        jobResult.job.status ===
          "RUNNING"
      ) {
        return jsonResponse(
          202,
          {
            status:
              "running",

            jobId:
              jobResult.jobId
          }
        );
      }

      await jobStore
        .markRunning({
          uid,
          jobId:
            jobResult.jobId
        });

      const brief =
        await getService()
          .buildBrief(
            normalizedRequest
          );

      const response =
        buildResponsePayload(
          brief
        );

      await controlStore
        .completeRequest({
          uid,
          idempotencyKey,
          requestHash,
          response
        });

      await jobStore
        .markCompleted({
          uid,
          jobId:
            jobResult.jobId,

          response
        });

      return jsonResponse(
        200,
        {
          status:
            "completed",

          jobId:
            jobResult.jobId
        }
      );

    } catch (error) {
      console.error(
        "Prospect intelligence background error:",
        error
      );

      if (claimed) {
        try {
          await controlStore
            .failRequest({
              uid,
              idempotencyKey,
              requestHash
            });
        } catch (
          cleanupError
        ) {
          console.error(
            "Prospect intelligence background control cleanup failed:",
            cleanupError
          );
        }

        try {
          await jobStore
            .markFailed({
              uid,
              jobId,

              errorMessage:
                "Prospect intelligence generation failed."
            });
        } catch (
          jobError
        ) {
          console.error(
            "Prospect intelligence background job cleanup failed:",
            jobError
          );
        }
      }

      const statusCode =
        Number.isInteger(
          error?.statusCode
        )
          ? error.statusCode
          : 500;

      return jsonResponse(
        statusCode,
        {
          status:
            "error",

          error:
            statusCode >=
              500
              ? "Prospect intelligence generation failed."
              : error.message
        }
      );
    }
  };
}

const handler =
  createHandler();

exports.handler =
  handler;

module.exports._test = {
  MAX_BODY_BYTES,
  cleanString,
  getBodyText,
  parseBody,
  validateRequest,
  getBearerToken,
  getIdempotencyKey,
  canonicalize,
  buildRequestHash,
  buildResponsePayload,
  createHandler
};
