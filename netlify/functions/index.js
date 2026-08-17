// Cloud Function Dependencies
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { runLeadPipeline } = require("./pipeline/runLeadPipeline");

// Initialize the Firebase Admin SDK safely
if (!admin.apps.length) {
  admin.initializeApp();
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
      "Membership Required: Your RyGuyLabs subscription could not be verified."
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
    return await runLeadPipeline({ geoContext, filters });
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

    const pipelineResult = await runLeadPipeline({ geoContext, filters });

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
