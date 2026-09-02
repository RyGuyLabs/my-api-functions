const admin =
  require("firebase-admin");

const {
  ProspectIntelligenceJobStore
} = require(
  "./intelligence/ProspectIntelligenceJobStore.js"
);

const ALLOWED_ORIGIN =
  "https://www.ryguylabs.com";

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
    "Prospect intelligence status Firebase initialization failed:",
    error.message
  );
}

function headers() {
  return {
    "Access-Control-Allow-Origin":
      ALLOWED_ORIGIN,

    "Access-Control-Allow-Headers":
      "Content-Type, Authorization",

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

function parseBody(
  body
) {
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

function getBearerToken(
  event
) {
  const authorization =
    event &&
    event.headers &&
    (
      event.headers.authorization ||
      event.headers.Authorization
    );

  if (
    typeof authorization !==
      "string" ||
    !authorization.startsWith(
      "Bearer "
    )
  ) {
    return null;
  }

  const token =
    authorization
      .substring(
        "Bearer ".length
      )
      .trim();

  return token || null;
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

function createHandler({
  verifyIdToken =
    verifyFirebaseIdToken,

  getJobStore =
    getRuntimeJobStore
} = {}) {
  return async function handler(
    event
  ) {
    if (
      event &&
      event.httpMethod ===
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
      !decodedUser ||
      !decodedUser.uid
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

    let body;

    try {
      body =
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

    const jobId =
      cleanString(
        body.jobId
      );

    if (!jobId) {
      return jsonResponse(
        400,
        {
          status:
            "error",

          error:
            "jobId is required."
        }
      );
    }

    try {
      const job =
        await getJobStore()
          .getJob({
            uid:
              decodedUser.uid,

            jobId
          });

      if (!job) {
        return jsonResponse(
          404,
          {
            status:
              "error",

            error:
              "Prospect intelligence job was not found."
          }
        );
      }

      if (
        job.status ===
          "PENDING" ||
        job.status ===
          "RUNNING"
      ) {
        return jsonResponse(
          202,
          {
            status:
              job.status.toLowerCase(),

            jobId
          }
        );
      }

      if (
        job.status ===
          "COMPLETED"
      ) {
        return jsonResponse(
          200,
          {
            ...job.response,

            cached:
              false,

            jobId
          }
        );
      }

      if (
        job.status ===
          "FAILED"
      ) {
        return jsonResponse(
          500,
          {
            status:
              "error",

            jobId,

            error:
              "Prospect intelligence generation failed."
          }
        );
      }

      return jsonResponse(
        500,
        {
          status:
            "error",

          error:
            "Prospect intelligence job has an invalid state."
        }
      );

    } catch (error) {
      console.error(
        "Prospect intelligence status error:",
        error
      );

      return jsonResponse(
        500,
        {
          status:
            "error",

          error:
            "Unable to read prospect intelligence job status."
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
  cleanString,
  parseBody,
  getBearerToken,
  createHandler
};
