// Cloud Function Dependencies
const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Initialize the Firebase Admin SDK
admin.initializeApp();

/**
 * Cloud Function to verify user ID (simulating a Squarespace membership check)
 * and mint a custom Firebase Auth token if the check passes.
 */
exports.mintCustomToken = functions.https.onCall(async (data, context) => {
  const userId = data.userId;

  // 1. Input Validation
  if (!userId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "User ID is required to mint a custom token."
    );
  }

  // 2. Mock Membership Check (SUCCESS only if userId is 'mock-user-123')
  if (userId !== "mock-user-123") {
    console.error(`Attempt to sign in with non-member ID: ${userId}`);
    // IMPORTANT: Use permission-denied to trigger the specific error message on the client
    throw new functions.https.HttpsError(
      "permission-denied",
      "Membership Required: Your RyGuyLabs subscription could not be verified."
    );
  }

  // 3. Mint the Custom Token
  try {
    const firebaseToken = await admin.auth().createCustomToken(userId);
    console.log(`Successfully minted token for user: ${userId}`);
    
    // Return the token to the client
    return { firebaseToken: firebaseToken };
  } catch (error) {
    console.error("Error creating custom token:", error);
    // Fallback for any Firebase Admin SDK failure
    throw new functions.https.HttpsError(
      "internal",
      "Failed to generate authentication token due to a server error."
    );
  }
});
