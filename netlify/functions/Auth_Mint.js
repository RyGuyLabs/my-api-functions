// --- SERVER SIDE CODE: FIREBASE CLOUD FUNCTION ---

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const fetch = require('node-fetch'); // Included based on your package.json

// 1. Initialize the Admin SDK
// This automatically authenticates using the Cloud Function's built-in service account, 
// bypassing the need for a downloaded JSON key file.
admin.initializeApp();

// Load the secure Squarespace Token from the Cloud Function environment variables
// This variable was set using 'firebase functions:config:set squarespace.token="YOUR_TOKEN"'
const SQUARESPACE_TOKEN = functions.config().squarespace.token; 

// 2. Define the HTTPS Callable Function Endpoint
// The client-side code will call this specific function name: 'mintCustomToken'
exports.mintCustomToken = functions.https.onCall(async (data, context) => {
    // Expecting the unique identifier of the user (e.g., from a Squarespace session or lookup)
    const customUserId = data.userId; 

    if (!customUserId) {
        throw new functions.https.HttpsError('invalid-argument', 'The user ID (userId) is missing from the request.');
    }

    if (!SQUARESPACE_TOKEN) {
        console.error("Server Misconfiguration: SQUARESPACE_TOKEN is missing.");
        throw new functions.https.HttpsError('internal', 'Server configuration error: Authentication token is undefined.');
    }

    try {
        // --- A. VALIDATE MEMBERSHIP STATUS WITH SQUARESPACE (The Gatekeeper) ---
        
        // IMPORTANT: Replace the placeholder URL below with your actual Squarespace Membership API endpoint
        // that checks the user's active status based on their ID.
        const squarespaceResponse = await fetch(
            `https://api.squarespace.com/v1/user/status/${customUserId}`, 
            {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${SQUARESPACE_TOKEN}`,
                    'User-Agent': 'Your-Custom-Auth-Service',
                    'Content-Type': 'application/json'
                }
            }
        );
        
        if (!squarespaceResponse.ok) {
             console.error('Squarespace API Check Failed:', squarespaceResponse.statusText);
             throw new functions.https.HttpsError('internal', 'Failed to verify membership status with Squarespace.');
        }

        const membershipData = await squarespaceResponse.json();

        // **CRITICAL CHECK: If Squarespace says the membership is not active, deny access.**
        if (!membershipData.isActiveMember) {
            throw new functions.https.HttpsError('permission-denied', 
                'User is not an active member according to Squarespace. Access denied.'
            );
        }
        
        // --- B. MINT THE FIREBASE TOKEN (Signing the user's passport) ---
        // If Squarespace verification passes, create a trusted, time-limited token.

        const customToken = await admin.auth().createCustomToken(customUserId);
        
        // Return the token to the client.
        return { firebaseToken: customToken };

    } catch (error) {
        // Handle common errors and ensure only safe messages are sent to the client
        if (error.code === 'permission-denied' || error.code === 'invalid-argument') {
            throw error;
        }
        console.error('UNEXPECTED SERVER ERROR during token minting:', error);
        throw new functions.https.HttpsError('internal', 'An unexpected error prevented sign-in.');
    }
});
