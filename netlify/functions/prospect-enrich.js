const admin =
  require("firebase-admin");

const {
  EnrichmentOrchestrator
} = require(
  "./enrichment/EnrichmentOrchestrator.js"
);

try {
  if (
    !admin.apps.length &&
    process.env.FIREBASE_SERVICE_ACCOUNT
  ) {
    admin.initializeApp({
      credential:
        admin.credential.cert(
          JSON.parse(
            process.env.FIREBASE_SERVICE_ACCOUNT
          )
        )
    });
  }
} catch (error) {
  console.error(
    "Prospect enrich Firebase initialization failed:",
    error.message
  );
}

const ALLOWED_ORIGIN =
  "https://www.ryguylabs.com";

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
      JSON.stringify(payload)
  };
}

function parseBody(body) {
  let parsed;

  try {
    parsed =
      typeof body === "string"
        ? JSON.parse(body)
        : body;
  } catch {
    const error =
      new Error(
        "Invalid JSON request body."
      );

    error.statusCode = 400;

    throw error;
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  ) {
    const error =
      new Error(
        "Request body must be a JSON object."
      );

    error.statusCode = 400;

    throw error;
  }

  return parsed;
}

function optionalString(
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

function requireString(
  value,
  fieldName
) {
  const clean =
    optionalString(
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

function validateRequest(
  body
) {
  const prospectName =
    requireString(
      body.prospectName,
      "prospectName"
    );

  const website =
    requireString(
      body.website,
      "website"
    );

  const candidateName =
    optionalString(
      body.candidateName
    ) ||
    prospectName;

  const candidateDomain =
    optionalString(
      body.candidateDomain
    );

  const city =
    optionalString(
      body.city
    );

  const state =
    optionalString(
      body.state
    );

  const registryEntity =
    body.registryEntity &&
    typeof body.registryEntity ===
      "object" &&
    !Array.isArray(
      body.registryEntity
    )
      ? body.registryEntity
      : null;

  return {
    prospectName,
    website,
    candidateName,
    candidateDomain,
    city,
    state:
      state
        ? state.toUpperCase()
        : null,
    registryEntity
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

let runtimeEnrichmentProvider =
  null;

function getRuntimeEnrichmentProvider() {
  if (
    runtimeEnrichmentProvider
  ) {
    return runtimeEnrichmentProvider;
  }

  runtimeEnrichmentProvider =
    new EnrichmentOrchestrator();

  return runtimeEnrichmentProvider;
}

function createHandler({
  verifyIdToken =
    verifyFirebaseIdToken,

  getEnrichmentProvider =
    getRuntimeEnrichmentProvider
} = {}) {
  return async function handler(
    event
  ) {
    if (
      event &&
      event.httpMethod === "OPTIONS"
    ) {
      return {
        statusCode: 200,
        headers:
          headers(),
        body: ""
      };
    }

    if (
      !event ||
      event.httpMethod !== "POST"
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

    const idToken =
      getBearerToken(
        event
      );

    if (!idToken) {
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
          idToken
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

    try {
      const request =
        validateRequest(
          parseBody(
            event.body
          )
        );

      const entity =
        request.registryEntity ||
        {
          companyName:
            request.prospectName,

          website:
            request.website,

          location: {
            city:
              request.city,

            state:
              request.state
          }
        };

      const candidateInfo = {
        candidateName:
          request.candidateName,

        candidateDomain:
          request.candidateDomain,

        formattedUrl:
          request.website,

        website:
          request.website
      };

      const enrichmentProvider =
        getEnrichmentProvider();

      const enrichment =
        await enrichmentProvider.enrich(
          entity,
          candidateInfo
        );

      return jsonResponse(
        200,
        {
          status:
            "success",

          requester: {
            uid:
              decodedUser.uid
          },

          prospect: {
            prospectName:
              request.prospectName,

            candidateName:
              request.candidateName,

            candidateDomain:
              request.candidateDomain,

            website:
              request.website
          },

          enrichment
        }
      );

    } catch (error) {
      const statusCode =
        Number.isInteger(
          error &&
          error.statusCode
        )
          ? error.statusCode
          : 500;

      if (
        statusCode >= 500
      ) {
        console.error(
          "Prospect enrich error:",
          error
        );
      }

      return jsonResponse(
        statusCode,
        {
          status:
            "error",

          error:
            statusCode >= 500
              ? "An error occurred while enriching the prospect."
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
  parseBody,
  optionalString,
  requireString,
  validateRequest,
  getBearerToken,
  createHandler
};
