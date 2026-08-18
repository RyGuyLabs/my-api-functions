const functions = require("firebase-functions");
const admin = require("firebase-admin");
const crypto = require("crypto");

const { runLeadPipeline } = require("./pipeline/runLeadPipeline.js");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault()
  });
}

const ALLOWED_ORIGINS = [
  "https://www.ryguylabs.com",
  "https://ryguylabs.com"
];

// Optional local development origins.
// Automatically excluded when NODE_ENV === "production".
if (process.env.NODE_ENV !== "production") {
  ALLOWED_ORIGINS.push(
    "http://localhost:8888",
    "http://localhost:3000"
  );
}

/**
 * Returns a valid CORS origin only when the requesting origin
 * is explicitly trusted.
 *
 * IMPORTANT:
 * We do NOT reflect arbitrary origins back to the browser.
 */
function getCorsOrigin(requestOrigin) {
  if (
    requestOrigin &&
    ALLOWED_ORIGINS.includes(requestOrigin)
  ) {
    return requestOrigin;
  }

  return null;
}

/**
 * Build CORS/security headers.
 */
function buildCorsHeaders(requestOrigin) {
  const headers = {
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization",

    "Access-Control-Allow-Methods":
      "POST, OPTIONS",

    "Access-Control-Max-Age":
      "86400",

    "Content-Type":
      "application/json",

    "Cache-Control":
      "no-store"
  };

  const allowedOrigin =
    getCorsOrigin(requestOrigin);

  if (allowedOrigin) {
    headers["Access-Control-Allow-Origin"] =
      allowedOrigin;

    headers["Vary"] = "Origin";
  }

  return headers;
}

// ============================================================================
// INPUT NORMALIZATION
// ============================================================================
//
// This function performs ONLY transport-level normalization.
//
// It does not:
// - search providers
// - enrich prospects
// - calculate scores
// - write ledger records
// - call AI
// ============================================================================

function normalizePipelineInput(params = {}) {
  let rawQuery =
    params.queryInput ||
    params.query ||
    params.filters?.industry ||
    "Roofing Contractors";

  // Ensure query is always a string.
  rawQuery =
    String(rawQuery).trim();

  // Remove HTML delimiters while preserving legitimate
  // business names such as:
  //
  // A-1 Roofing
  // 24-7 Plumbing
  //
  const sanitizedQuery =
    rawQuery
      .replace(/[<>]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200);

  if (!sanitizedQuery) {
    throw new Error(
      "A valid search query is required."
    );
  }

  // Preserve explicitly supplied geographic context.
  let geoContext =
    params.geoContext || {
      states: ["FL"]
    };

  // --------------------------------------------------------------------------
  // QUERY LOCATION PARSING
  // --------------------------------------------------------------------------
  //
  // Examples:
  //
  // Solar Contractors in Tampa FL
  // Roofing Contractors, Orlando, FL
  //
  // This is ONLY request parsing.
  // Provider logic remains inside the pipeline.
  // --------------------------------------------------------------------------

  let searchKeyword =
    sanitizedQuery;

  const locationMatch =
    sanitizedQuery.match(
      /^(.+?)\s+(?:in|,)\s+([A-Za-z][A-Za-z\s.'-]*?)(?:,\s*([A-Za-z]{2}))?$/i
    );

  if (locationMatch) {
    searchKeyword =
      locationMatch[1]
        .replace(/\s+/g, " ")
        .trim();

    const city =
      locationMatch[2]
        .replace(/\s+/g, " ")
        .trim();

    const state =
      locationMatch[3]
        ? locationMatch[3].toUpperCase()
        : (
            Array.isArray(
              geoContext.states
            ) &&
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
// There is intentionally NO AI logic here.
//
// There is intentionally NO legacy fallback here.
//
// Firebase and Netlify both call this exact same function.
// ============================================================================

async function executeCorePipeline(
  params = {}
) {
  const normalizedInput =
    normalizePipelineInput(params);

  return await runLeadPipeline({
    geoContext:
      normalizedInput.geoContext,

    filters:
      normalizedInput.filters
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
//
// This is NOT production membership verification.
// ============================================================================

exports.mintCustomToken =
  functions.https.onCall(
    async (data, context) => {

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

      // ----------------------------------------------------------------------
      // DEVELOPMENT MEMBERSHIP GATE
      // ----------------------------------------------------------------------
      //
      // KEEPING THIS INTACT prevents breaking your current authentication
      // flow while the real Squarespace membership entitlement layer is
      // finalized.
      // ----------------------------------------------------------------------

      if (
        userId !== "mock-user-123"
      ) {
        console.error(
          "[AUTH DENIED] Membership verification failed.",
          {
            userId
          }
        );

        throw new functions.https.HttpsError(
          "permission-denied",
          "Membership Required: Your subscription could not be verified."
        );
      }

      try {
        const firebaseToken =
          await admin
            .auth()
            .createCustomToken(userId);

        console.log(
          "[AUTH TOKEN CREATED]",
          {
            userId
          }
        );

        return {
          firebaseToken
        };

      } catch (error) {

        console.error(
          "[AUTH TOKEN ERROR]",
          {
            userId,
            message: error.message
          }
        );

        throw new functions.https.HttpsError(
          "internal",
          "Failed to generate authentication token."
        );
      }
    }
  );

// ============================================================================
// FIREBASE CALLABLE ADAPTER
// ============================================================================
//
// Firebase handles transport-level authentication.
//
// runLeadPipeline handles the Lead Engine itself.
// ============================================================================

exports.processLeadPipeline =
  functions.https.onCall(
    async (data, context) => {

      const requestId =
        crypto.randomUUID();

      console.log(
        "[PIPELINE REQUEST START]",
        {
          requestId,
          authenticated:
            !!context.auth,

          uid:
            context.auth?.uid || null,

          timestamp:
            new Date().toISOString()
        }
      );

      // ----------------------------------------------------------------------
      // AUTHENTICATION GUARD
      // ----------------------------------------------------------------------

      if (!context.auth) {

        console.warn(
          "[PIPELINE AUTH FAILURE]",
          {
            requestId
          }
        );

        throw new functions.https.HttpsError(
          "unauthenticated",
          "Authentication required to access Lead Engine services."
        );
      }

      try {

        const result =
          await executeCorePipeline({
            queryInput:
              data?.queryInput ||
              data?.query,

            geoContext:
              data?.geoContext,

            filters:
              data?.filters
          });

        console.log(
          "[PIPELINE REQUEST SUCCESS]",
          {
            requestId,
            uid:
              context.auth.uid,

            count:
              result?.count || 0,

            status:
              result?.status ||
              "unknown"
          }
        );

        return {
          ...result,
          requestId
        };

      } catch (error) {

        console.error(
          "[PIPELINE REQUEST FAILURE]",
          {
            requestId,

            uid:
              context.auth.uid,

            message:
              error.message,

            stack:
              error.stack
          }
        );

        // Do not expose internal pipeline details
        // through the Firebase client.
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
// - execute AI directly
//
// It authenticates the request, normalizes transport input,
// invokes runLeadPipeline(), and returns the result.
// ============================================================================

exports.handler =
  async (event, context) => {

    const requestId =
      crypto.randomUUID();

    const requestOrigin =
      event.headers?.origin ||
      event.headers?.Origin ||
      null;

    const headers =
      buildCorsHeaders(
        requestOrigin
      );

    // ------------------------------------------------------------------------
    // ORIGIN GUARD
    // ------------------------------------------------------------------------
    //
    // Requests from unknown browser origins do not receive an
    // Access-Control-Allow-Origin header.
    //
    // This does NOT replace authentication.
    // It is an additional browser-side boundary.
    // ------------------------------------------------------------------------

    if (
      requestOrigin &&
      !ALLOWED_ORIGINS.includes(
        requestOrigin
      )
    ) {

      console.warn(
        "[NETLIFY ORIGIN REJECTED]",
        {
          requestId,
          origin:
            requestOrigin
        }
      );

      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({
          error:
            "ORIGIN_NOT_ALLOWED",

          message:
            "Request origin is not authorized.",

          requestId
        })
      };
    }

    // ------------------------------------------------------------------------
    // CORS PREFLIGHT
    // ------------------------------------------------------------------------

    if (
      event.httpMethod ===
      "OPTIONS"
    ) {

      return {
        statusCode: 204,
        headers,
        body: ""
      };
    }

    // ------------------------------------------------------------------------
    // HTTP METHOD GUARD
    // ------------------------------------------------------------------------

    if (
      event.httpMethod !==
      "POST"
    ) {

      return {
        statusCode: 405,
        headers,
        body: JSON.stringify({
          error:
            "METHOD_NOT_ALLOWED",

          message:
            "Lead Engine requests must use POST.",

          requestId
        })
      };
    }

    console.log(
      "[NETLIFY PIPELINE REQUEST START]",
      {
        requestId,

        timestamp:
          new Date().toISOString(),

        origin:
          requestOrigin
      }
    );

    try {

      // ----------------------------------------------------------------------
      // REQUEST BODY PARSING
      // ----------------------------------------------------------------------

      let body = {};

      if (event.body) {

        try {

          body =
            typeof event.body ===
            "string"
              ? JSON.parse(
                  event.body
                )
              : event.body;

        } catch (parseError) {

          console.warn(
            "[REQUEST PARSE FAILURE]",
            {
              requestId,

              message:
                parseError.message
            }
          );

          return {
            statusCode: 400,
            headers,

            body:
              JSON.stringify({
                error:
                  "INVALID_JSON",

                message:
                  "Request body must contain valid JSON.",

                requestId
              })
          };
        }
      }

      // ----------------------------------------------------------------------
      // BODY TYPE GUARD
      // ----------------------------------------------------------------------

      if (
        !body ||
        typeof body !== "object" ||
        Array.isArray(body)
      ) {

        return {
          statusCode: 400,
          headers,

          body:
            JSON.stringify({
              error:
                "INVALID_REQUEST_BODY",

              message:
                "Request body must be a JSON object.",

              requestId
            })
        };
      }

      // ----------------------------------------------------------------------
      // AUTHORIZATION
      // ----------------------------------------------------------------------
      //
      // Netlify does not automatically inherit Firebase Callable
      // authentication.
      //
      // Therefore the client must provide:
      //
      // Authorization: Bearer <Firebase ID token>
      //
      // The Firebase Admin SDK verifies the token cryptographically.
      // ----------------------------------------------------------------------

      const authorization =
  event.headers?.authorization ||
  event.headers?.Authorization ||
  "";

console.log(
  "[NETLIFY AUTH HEADER CHECK]",
  {
    requestId,
    authorizationPresent: !!authorization,
    authorizationPrefix:
      authorization
        ? authorization.substring(0, 20)
        : null
  }
);

      if (
        !authorization.startsWith(
          "Bearer "
        )
      ) {

        console.warn(
          "[NETLIFY AUTH FAILURE]",
          {
            requestId
          }
        );

        return {
          statusCode: 401,
          headers,

          body:
            JSON.stringify({
              error:
                "UNAUTHENTICATED",

              message:
                "Authentication required.",

              requestId
            })
        };
      }

      const idToken =
        authorization
          .substring(
            "Bearer ".length
          )
          .trim();

      if (!idToken) {

        return {
          statusCode: 401,
          headers,

          body:
            JSON.stringify({
              error:
                "UNAUTHENTICATED",

              message:
                "Authentication token is missing.",

              requestId
            })
        };
      }

      // ----------------------------------------------------------------------
      // FIREBASE TOKEN VERIFICATION
      // ----------------------------------------------------------------------

      let decodedToken;

      try {

        decodedToken =
          await admin
            .auth()
            .verifyIdToken(
              idToken
            );

      } catch (authError) {

        console.warn(
          "[NETLIFY TOKEN VERIFICATION FAILURE]",
          {
            requestId,

            message:
              authError.message
          }
        );

        return {
          statusCode: 401,
          headers,

          body:
            JSON.stringify({
              error:
                "INVALID_AUTH_TOKEN",

              message:
                "Authentication token could not be verified.",

              requestId
            })
        };
      }


      const uid =
        decodedToken.uid;

      console.log(
        "[NETLIFY AUTH SUCCESS]",
        {
          requestId,
          uid
        }
      );


      const rawQuery =
        body.query ||
        body.queryInput ||
        body.filters?.industry ||
        "Roofing Contractors";

      const pipelineResult =
        await executeCorePipeline({
          queryInput:
            rawQuery,

          geoContext:
            body.geoContext,

          filters:
            body.filters
        });

      console.log(
        "[NETLIFY PIPELINE SUCCESS]",
        {
          requestId,

          uid,

          count:
            pipelineResult?.count ||
            0,

          status:
            pipelineResult?.status ||
            "unknown"
        }
      );

      return {
        statusCode: 200,

        headers,

        body:
          JSON.stringify({
            ...pipelineResult,
            requestId
          })
      };

    } catch (error) {

     
      console.error(
        "[NETLIFY PIPELINE FAILURE]",
        {
          requestId,

          message:
            error.message,

          stack:
            error.stack
        }
      );

      return {
        statusCode: 500,

        headers,

        body:
          JSON.stringify({
            error:
              "PIPELINE_EXECUTION_EXCEPTION",

            message:
              "Lead Engine Pipeline execution failed.",

            requestId
          })
      };
    }
  };
