const admin =
  require("firebase-admin");

const {
  GoogleDiscoveryProvider
} = require(
  "./providers/GoogleDiscoveryProvider.js"
);

const {
  PostgresFloridaRegistryDatabase
} = require(
  "./database/PostgresFloridaRegistryDatabase.js"
);

const {
  CandidateRegistryReconciler
} = require(
  "./reconciliation/CandidateRegistryReconciler.js"
);

const {
  ProspectSearchService
} = require(
  "./prospects/ProspectSearchService.js"
);

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
    "Prospect search Firebase initialization failed:",
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

function requireString(
  value,
  fieldName
) {
  const clean =
    String(value || "")
      .replace(/\s+/g, " ")
      .trim();

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

function normalizeState(value) {
  const state =
    requireString(
      value,
      "state"
    )
      .toUpperCase();

  if (
    !/^[A-Z]{2}$/.test(state)
  ) {
    const error =
      new Error(
        "state must be a two-letter code."
      );

    error.statusCode = 400;

    throw error;
  }

  return state;
}

function normalizeInteger(
  value,
  {
    fieldName,
    defaultValue,
    minimum,
    maximum
  }
) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return defaultValue;
  }

  const parsed =
    Number.parseInt(
      value,
      10
    );

  if (
    !Number.isFinite(parsed) ||
    parsed < minimum ||
    parsed > maximum
  ) {
    const error =
      new Error(
        `${fieldName} must be between ${minimum} and ${maximum}.`
      );

    error.statusCode = 400;

    throw error;
  }

  return parsed;
}

function validateRequest(body) {
  return {
    industry:
      requireString(
        body.industry,
        "industry"
      ),

    city:
      requireString(
        body.city,
        "city"
      ),

    state:
      normalizeState(
        body.state || "FL"
      ),

    discoveryLimit:
      normalizeInteger(
        body.discoveryLimit,
        {
          fieldName:
            "discoveryLimit",
          defaultValue:
            10,
          minimum:
            1,
          maximum:
            10
        }
      ),

    autoEnrichLimit:
      normalizeInteger(
        body.autoEnrichLimit,
        {
          fieldName:
            "autoEnrichLimit",
          defaultValue:
            5,
          minimum:
            0,
          maximum:
            10
        }
      )
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

function getBearerToken(event) {
  const authorization =
    event &&
    event.headers &&
    (
      event.headers.authorization ||
      event.headers.Authorization
    );

  if (
    typeof authorization !== "string" ||
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

let runtimeSearchService =
  null;

function getRuntimeSearchService() {
  if (runtimeSearchService) {
    return runtimeSearchService;
  }

  if (!process.env.DATABASE_URL) {
    const error =
      new Error(
        "Prospect registry database is not configured."
      );

    error.statusCode = 503;

    throw error;
  }

  const database =
    new PostgresFloridaRegistryDatabase({
      connectionString:
        process.env.DATABASE_URL
    });

  runtimeSearchService =
    new ProspectSearchService({
      discoveryProvider:
        new GoogleDiscoveryProvider(),

      registryReconciler:
        new CandidateRegistryReconciler({
          database
        }),

      enrichmentProvider:
        new EnrichmentOrchestrator()
    });

  return runtimeSearchService;
}

function createHandler({
  verifyIdToken =
    verifyFirebaseIdToken,

  getSearchService =
    getRuntimeSearchService
} = {}) {
  return async function handler(event) {
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
            "Method Not Allowed",
          prospects:
            []
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
            "Authentication required.",
          prospects:
            []
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
            "Invalid Firebase token.",
          prospects:
            []
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
            "Invalid Firebase token.",
          prospects:
            []
        }
      );
    }

    try {
      const body =
        parseBody(
          event.body
        );

      const request =
        validateRequest(
          body
        );

      const searchService =
        getSearchService();

      const result =
        await searchService.search(
          request
        );

      return jsonResponse(
        200,
        {
          ...result,

          requester: {
            uid:
              decodedUser.uid
          }
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
          "Prospect search error:",
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
              ? "An error occurred while searching for prospects."
              : error.message,

          prospects:
            []
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
  requireString,
  normalizeState,
  normalizeInteger,
  validateRequest,
  getBearerToken,
  createHandler
};
