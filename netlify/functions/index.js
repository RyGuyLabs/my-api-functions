const functions = require("firebase-functions");
const admin = require("firebase-admin");
const crypto = require("crypto");

// ============================================================================
// CORE PIPELINE
// ============================================================================
//
// IMPORTANT:
// index.js is intentionally a TRANSPORT/SECURITY layer only.
// All discovery, Sunbiz verification, enrichment, qualification,
// canonicalization, and ledger processing belongs inside runLeadPipeline.js.
//
// This prevents Firebase and Netlify from developing separate pipeline logic.
// ============================================================================

const { runLeadPipeline } = require("./pipeline/runLeadPipeline.js");

// ============================================================================
// FIREBASE ADMIN INITIALIZATION
// ============================================================================

if (!admin.apps.length) {
  admin.initializeApp();
}

// ============================================================================
// PRODUCTION CORS CONFIGURATION
// ============================================================================

const ALLOWED_ORIGINS = [
  "https://www.ryguylabs.com",
  "https://ryguylabs.com"
];

// Optional local development origins.
// These can be removed when local development is no longer needed.
if (process.env.NODE_ENV !== "production") {
  ALLOWED_ORIGINS.push(
    "http://localhost:8888",
    "http://localhost:3000"
  );
}

function getCorsOrigin(requestOrigin) {
  if (requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)) {
    return requestOrigin;
  }

  return ALLOWED_ORIGINS[0];
}

function buildCorsHeaders(requestOrigin) {
  return {
    "Access-Control-Allow-Origin": getCorsOrigin(requestOrigin),
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Content-Type": "application/json",
    "Cache-Control": "no-store"
  };
}

// ============================================================================
// INPUT NORMALIZATION
// ============================================================================

function normalizePipelineInput(params = {}) {
  let rawQuery =
    params.queryInput ||
    params.query ||
    params.filters?.industry ||
    "Roofing Contractors";

  // Ensure query is always a string.
  rawQuery = String(rawQuery).trim();

  // Remove potentially dangerous HTML delimiters without destroying
  // legitimate business names such as "A-1 Roofing" or "24-7 Plumbing".
  const sanitizedQuery = rawQuery
    .replace(/[<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);

  if (!sanitizedQuery) {
    throw new Error("A valid search query is required.");
  }

  // Preserve explicitly supplied geographic context.
  let geoContext = params.geoContext || { states: ["FL"] };

  // Detect queries such as:
  // "Solar Contractors in Tampa FL"
  // "Roofing Contractors, Orlando, FL"
  //
  // This is only query parsing. It does NOT perform provider logic.
  let searchKeyword = sanitizedQuery;

  const locationMatch = sanitizedQuery.match(
    /^(.+?)\s+(?:in|,)\s+([A-Za-z][A-Za-z\s.'-]*?)(?:,\s*([A-Za-z]{2}))?$/i
  );

  if (locationMatch) {
    searchKeyword = locationMatch[1]
      .replace(/\s+/g, " ")
      .trim();

    const city = locationMatch[2]
      .replace(/\s+/g, " ")
      .trim();

    const state = locationMatch[3]
      ? locationMatch[3].toUpperCase()
      : (
          Array.isArray(geoContext.states) &&
          geoContext.states[0]
            ? geoContext.states[0]
            : "FL"
        );

    geoContext = {
      ...geoContext,
      city,
      states: [state]
    };
  }

  const filters = {
    ...(params.filters || {}),
    industry: searchKeyword
  };

  return {
    queryInput: searchKeyword,
    geoContext,
    filters
  };
}

// ============================================================================
// CORE EXECUTION BRIDGE
// ============================================================================
//
// There is intentionally NO provider logic here.
//
// There is intentionally NO enrichment logic here.
//
// There is intentionally NO qualification logic here.
//
// There is intentionally NO legacy fallback.
//
// Both Firebase and Netlify call this exact same function.
// ============================================================================

async function executeCorePipeline(params = {}) {
  const normalizedInput = normalizePipelineInput(params);

  return await runLeadPipeline({
    geoContext: normalizedInput.geoContext,
    filters: normalizedInput.filters
  });
}

// ============================================================================
// FIREBASE CUSTOM TOKEN
// ============================================================================
//
// DEVELOPMENT-ONLY membership bridge.
//
// IMPORTANT:
// "mock-user-123" remains a development placeholder.
// It must NOT be considered production membership verification.
//
// Production implementation should replace this check with your actual
// Squarespace membership verification mechanism before deployment.
// ============================================================================

exports.mintCustomToken = functions.https.onCall(async (data, context) => {
  const userId =
    typeof data?.userId === "string"
      ? data.userId.trim()
      : "";

  if (!userId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "User ID is required to mint a custom token."
    );
  }

  // --------------------------------------------------------------------------
  // DEVELOPMENT GATE
  // --------------------------------------------------------------------------
  //
  // Do not mistake this for production membership verification.
  //
  // Keep this explicit so it cannot accidentally be confused with a real
  // Squarespace entitlement check.
  // --------------------------------------------------------------------------

  if (userId !== "mock-user-123") {
    console.error("[AUTH DENIED] Membership verification failed.", {
      userId
    });

    throw new functions.https.HttpsError(
      "permission-denied",
      "Membership Required: Your subscription could not be verified."
    );
  }

  try {
    const firebaseToken = await admin.auth().createCustomToken(userId);

    console.log("[AUTH TOKEN CREATED]", {
      userId
    });

    return {
      firebaseToken
    };
  } catch (error) {
    console.error("[AUTH TOKEN ERROR]", {
      userId,
      message: error.message
    });

    throw new functions.https.HttpsError(
      "internal",
      "Failed to generate authentication token."
    );
  }
});

// ============================================================================
// FIREBASE CALLABLE ADAPTER
// ============================================================================
//
// Firebase handles authentication.
// runLeadPipeline handles the actual Lead Engine.
// ============================================================================

exports.processLeadPipeline = functions.https.onCall(
  async (data, context) => {
    const requestId = crypto.randomUUID();

    console.log("[PIPELINE REQUEST START]", {
      requestId,
      authenticated: !!context.auth,
      uid: context.auth?.uid || null,
      timestamp: new Date().toISOString()
    });

    // ------------------------------------------------------------------------
    // AUTHENTICATION GUARD
    // ------------------------------------------------------------------------

    if (!context.auth) {
      console.warn("[PIPELINE AUTH FAILURE]", {
        requestId
      });

      throw new functions.https.HttpsError(
        "unauthenticated",
        "Authentication required to access Lead Engine services."
      );
    }

    try {
      const result = await executeCorePipeline({
        queryInput: data?.queryInput || data?.query,
        geoContext: data?.geoContext,
        filters: data?.filters
      });

      console.log("[PIPELINE REQUEST SUCCESS]", {
        requestId,
        uid: context.auth.uid,
        count: result?.count || 0,
        status: result?.status || "unknown"
      });

      return {
        ...result,
        requestId
      };
    } catch (error) {
      console.error("[PIPELINE REQUEST FAILURE]", {
        requestId,
        uid: context.auth.uid,
        message: error.message,
        stack: error.stack
      });

      throw new functions.https.HttpsError(
        "internal",
        "Lead Engine Pipeline execution failed.",
        {
          requestId
        }
      );
    }
  }
);

// ============================================================================
// NETLIFY HTTP ADAPTER
// ============================================================================
//
// This endpoint is intentionally thin.
//
// It does NOT:
// - search Sunbiz directly
// - perform enrichment directly
// - calculate qualification directly
// - create ledger entries directly
//
// It simply authenticates the request, normalizes transport input,
// invokes runLeadPipeline(), and returns the result.
// ============================================================================

exports.handler = async (event, context) => {
  const requestId = crypto.randomUUID();
  const requestOrigin = event.headers?.origin || event.headers?.Origin;

  const headers = buildCorsHeaders(requestOrigin);

  // --------------------------------------------------------------------------
  // CORS PREFLIGHT
  // --------------------------------------------------------------------------

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers,
      body: ""
    };
  }

  // --------------------------------------------------------------------------
  // HTTP METHOD GUARD
  // --------------------------------------------------------------------------

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        error: "METHOD_NOT_ALLOWED",
        message: "Lead Engine requests must use POST.",
        requestId
      })
    };
  }

  console.log("[NETLIFY PIPELINE REQUEST START]", {
    requestId,
    timestamp: new Date().toISOString(),
    origin: requestOrigin || null
  });

  try {
    // ------------------------------------------------------------------------
    // REQUEST BODY PARSING
    // ------------------------------------------------------------------------

    let body = {};

    if (event.body) {
      try {
        body =
          typeof event.body === "string"
            ? JSON.parse(event.body)
            : event.body;
      } catch (parseError) {
        console.warn("[REQUEST PARSE FAILURE]", {
          requestId,
          message: parseError.message
        });

        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error: "INVALID_JSON",
            message: "Request body must contain valid JSON.",
            requestId
          })
        };
      }
    }

    // ------------------------------------------------------------------------
    // AUTHORIZATION
    // ------------------------------------------------------------------------
    //
    // Netlify does not automatically inherit Firebase Callable authentication.
    // If an Authorization Bearer token is supplied, verify it here.
    //
    // This prevents the Netlify endpoint from being treated as an unrestricted
    // public pipeline.
    // ------------------------------------------------------------------------

    const authorization =
      event.headers?.authorization ||
      event.headers?.Authorization ||
      "";

    if (!authorization.startsWith("Bearer ")) {
      console.warn("[NETLIFY AUTH FAILURE]", {
        requestId
      });

      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          error: "UNAUTHENTICATED",
          message: "Authentication required.",
          requestId
        })
      };
    }

    const idToken = authorization.substring("Bearer ".length).trim();

    if (!idToken) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          error: "UNAUTHENTICATED",
          message: "Authentication token is missing.",
          requestId
        })
      };
    }

    let decodedToken;

    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (authError) {
      console.warn("[NETLIFY TOKEN VERIFICATION FAILURE]", {
        requestId,
        message: authError.message
      });

      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          error: "INVALID_AUTH_TOKEN",
          message: "Authentication token could not be verified.",
          requestId
        })
      };
    }

    console.log("[NETLIFY AUTH SUCCESS]", {
      requestId,
      uid: decodedToken.uid
    });

    // ------------------------------------------------------------------------
    // PIPELINE EXECUTION
    // ------------------------------------------------------------------------

    const rawQuery =
      body.query ||
      body.queryInput ||
      body.filters?.industry ||
      "Roofing Contractors";

    const pipelineResult = await executeCorePipeline({
      queryInput: rawQuery,
      geoContext: body.geoContext,
      filters: body.filters
    });

    console.log("[NETLIFY PIPELINE SUCCESS]", {
      requestId,
      uid: decodedToken.uid,
      count: pipelineResult?.count || 0,
      status: pipelineResult?.status || "unknown"
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ...pipelineResult,
        requestId
      })
    };

  } catch (error) {
    // ------------------------------------------------------------------------
    // INTERNAL ERROR
    // ------------------------------------------------------------------------
    //
    // Do NOT return error.message to the public client.
    // The detailed error remains in server logs, identified by requestId.
    // ------------------------------------------------------------------------

    console.error("[NETLIFY PIPELINE FAILURE]", {
      requestId,
      message: error.message,
      stack: error.stack
    });

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "PIPELINE_EXECUTION_EXCEPTION",
        message: "Lead Engine Pipeline execution failed.",
        requestId
      })
    };
  }
};
