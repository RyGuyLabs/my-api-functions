// Cloud Function Dependencies
const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Pipeline & Provider Architecture Imports (Note the explicit .js extensions)
const { EvidenceLedgerAdapter } = require("./enrichment/EvidenceLedgerAdapter.js");
const { GoogleDiscoveryProvider } = require("./providers/GoogleDiscoveryProvider.js");
const { SunbizProvider } = require("./providers/SunbizProvider.js");
const { MockProvider } = require("./providers/MockProvider.js");
const { WebsiteReconProvider } = require("./providers/WebsiteReconProvider.js");
const { EnrichmentOrchestrator } = require("./enrichment/EnrichmentOrchestrator.js");
const { QualificationEngine } = require("./qualification/QualificationEngine.js");

// Fallback to legacy pipeline module if present, maintaining complete system backward compatibility
let legacyRunLeadPipeline;
try {
  legacyRunLeadPipeline = require("./pipeline/runLeadPipeline").runLeadPipeline;
} catch (e) {
  legacyRunLeadPipeline = null;
}

// Initialize the Firebase Admin SDK safely
if (!admin.apps.length) {
  admin.initializeApp();
}

// ============================================================================
// SINGLETON ORCHESTRATOR INITIALIZATION
// Instantiated once per instance startup to maintain state & ledger integrity
// ============================================================================
const ledger = new EvidenceLedgerAdapter();
const qualificationEngine = new QualificationEngine();

const orchestrator = new EnrichmentOrchestrator({
  ledger,
  qualificationEngine,
  providers: [
    new GoogleDiscoveryProvider(),
    new SunbizProvider(),
    new WebsiteReconProvider(),
    new MockProvider()
  ]
});

/**
 * Core execution bridge that maps incoming request parameters to the active orchestrator pipeline.
 * Falls back safely to legacy runLeadPipeline if needed.
 */
async function executeCorePipeline(params) {
  const queryInput = params.queryInput || (params.filters && params.filters.industry) || "Roofing Contractors";
  const geoContext = params.geoContext || { states: ["FL"] };
  const filters = params.filters || { industry: queryInput };

  if (orchestrator && typeof orchestrator.executePipeline === "function") {
    return await orchestrator.executePipeline({ queryInput, geoContext, filters });
  } else if (typeof legacyRunLeadPipeline === "function") {
    return await legacyRunLeadPipeline({ geoContext, filters });
  } else {
    throw new Error("No active lead execution pipeline found.");
  }
}

/**
 * Cloud Function to verify user ID (simulating a Squarespace membership check)
 * and mint a custom Firebase Auth token if the check passes.
 */
exports.mintCustomToken = functions.https.onCall(async (data, context) => {
  const userId = data.userId;

  if (!userId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "User ID is required to mint a custom token."
    );
  }

  if (userId !== "mock-user-123") {
    console.error(`Attempt to sign in with non-member ID: ${userId}`);
    throw new functions.https.HttpsError(
      "permission-denied",
      "Membership Required: Your subscription could not be verified."
    );
  }

  try {
    const firebaseToken = await admin.auth().createCustomToken(userId);
    console.log(`Successfully minted token for user: ${userId}`);
    return { firebaseToken: firebaseToken };
  } catch (error) {
    console.error("Error creating custom token:", error);
    throw new functions.https.HttpsError(
      "internal",
      "Failed to generate authentication token due to a server error."
    );
  }
});

// ============================================================================
// FIREBASE CALLABLE ADAPTER
// ============================================================================

exports.processLeadPipeline = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Authentication required to access Lead Engine services."
    );
  }

  try {
    const geoContext = data.geoContext || { states: ["FL"] };
    const filters = data.filters || { industry: "Roofing Contractors" };
    return await executeCorePipeline({ geoContext, filters });
  } catch (error) {
    console.error("Error executing Firebase processLeadPipeline:", error);
    throw new functions.https.HttpsError(
      "internal",
      `Lead Engine Pipeline Error: ${error.message}`
    );
  }
});

// ============================================================================
// NETLIFY HTTP ADAPTER (CORS + Transport mapping to core pipeline)
// ============================================================================

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const queryInput = body.query || "Roofing Contractors";
    const geoContext = body.geoContext || { states: ["FL"] };
    const filters = body.filters || { industry: queryInput };

    const pipelineResult = await executeCorePipeline({ queryInput, geoContext, filters });

    return {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify(pipelineResult)
    };
  } catch (error) {
    console.error("Netlify Handler Error:", error);
    return {
      statusCode: 500,
      headers: headers,
      body: JSON.stringify({
        error: "Pipeline Execution Exception",
        message: error.message
      })
    };
  }
};
