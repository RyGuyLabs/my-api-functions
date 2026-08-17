// Cloud Function Dependencies
const functions = require("firebase-functions");
const admin = require("firebase-admin");

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

// ============================================================================
// RYGUY LABS LEAD ENGINE EXTENSION (Firebase Callable)
// ============================================================================

/**
 * Cloud Function to execute the Lead Engine Pipeline.
 * Consumes Sunbiz provider, Evidence Ledger, and Enrichment modules.
 */
exports.processLeadPipeline = functions.https.onCall(async (data, context) => {
  // 1. Optional Auth Guard (Ensures only authenticated users can run searches)
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Authentication required to access Lead Engine services."
    );
  }

  try {
    const { SunbizProvider } = require("./providers/SunbizProvider");
    const { EvidenceLedgerAdapter } = require("./ledger/EvidenceLedgerAdapter");
    const { websiteRecon } = require("./enrichment/websiterecon");
    const { contactSearch } = require("./enrichment/contactSearch");

    const provider = new SunbizProvider();
    const ledger = new EvidenceLedgerAdapter();

    const geoContext = data.geoContext || { states: ["FL"] };
    const filters = data.filters || { industry: "Roofing" };

    // Search registry candidate records
    const rawRecords = await provider.search(geoContext, filters);

    // Normalize and register in Evidence Ledger with dual-hash protection
    const processedLeads = await Promise.all(
      rawRecords.map(async (raw) => {
        const normalized = provider.normalize(raw);

        // Record evidence
        const evidenceEntry = ledger.recordObservation({
          providerName: provider.name,
          rawPayload: raw,
          normalizedEntity: normalized,
          sourceUrl: "https://search.sunbiz.org/",
          retrievedAt: new Date().toISOString()
        });

        // Optional website & contact enrichment
        const websiteData = normalized.website 
          ? await websiteRecon(normalized.website) 
          : null;
          
        const contactData = await contactSearch(
          normalized.companyName, 
          normalized.location
        );

        return {
          prospectId: `prospect_${evidenceEntry.inputSignalId}`,
          entity: normalized,
          evidenceProvenance: {
            sourceContentHash: evidenceEntry.sourceContentHash,
            canonicalEntityHash: evidenceEntry.canonicalEntityHash,
            signalRecordHash: evidenceEntry.signalRecordHash
          },
          enrichment: {
            website: websiteData,
            contacts: contactData
          },
          accessPolicy: provider.getAccessPolicy(),
          capabilityProfile: provider.getCapabilityProfile()
        };
      })
    );

    return {
      status: "success",
      query: { geoContext, filters },
      count: processedLeads.length,
      leads: processedLeads
    };
  } catch (error) {
    console.error("Error executing processLeadPipeline:", error);
    throw new functions.https.HttpsError(
      "internal",
      `Lead Engine Pipeline Error: ${error.message}`
    );
  }
});

// ============================================================================
// NETLIFY NATIVE SERVERLESS HANDLER (Resolves CORS preflight for fetch requests)
// ============================================================================

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // 1. Handle HTTP OPTIONS preflight request immediately
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const queryInput = body.query || "Roofing Contractors";
    const geoContext = body.geoContext || { states: ["FL"] };
    const filters = body.filters || { industry: queryInput };

    const { SunbizProvider } = require("./providers/SunbizProvider");
    const { EvidenceLedgerAdapter } = require("./ledger/EvidenceLedgerAdapter");

    const provider = new SunbizProvider();
    const ledger = new EvidenceLedgerAdapter();

    // 2. Fetch raw registry array from provider
    const rawRecords = await provider.search(geoContext, filters);

    if (rawRecords && rawRecords.length > 0) {
      // Map every raw record through normalization and ledger observation
      const leads = rawRecords.map((raw) => {
        const normalized = provider.normalize ? provider.normalize(raw) : raw;
        const evidenceEntry = ledger.recordObservation({
          providerName: provider.name || "SunbizProvider",
          rawPayload: raw,
          normalizedEntity: normalized,
          sourceUrl: "https://search.sunbiz.org/",
          retrievedAt: new Date().toISOString()
        });

        return {
          prospectName: normalized.companyName || normalized.name || "Active Prospect",
          location: normalized.location || normalized.city || "Florida",
          score: 95,
          priority: "HIGH PRIORITY",
          reasons: [
            "Verified live corporate registration via Sunbiz.",
            "Canonical ledger entry generated and hash-bound."
          ],
          evidenceLedger: {
            inputSignalId: evidenceEntry.inputSignalId,
            sourceContentHash: evidenceEntry.sourceContentHash,
            canonicalEntityHash: evidenceEntry.canonicalEntityHash
          }
        };
      });

      // Return complete array payload + fallback properties for legacy single-item consumers
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          status: "success",
          count: leads.length,
          leads: leads,
          // Primary record defaults for single-card UI bindings
          prospectName: leads[0].prospectName,
          location: leads[0].location,
          score: leads[0].score,
          priority: leads[0].priority,
          reasons: leads[0].reasons,
          evidenceLedger: leads[0].evidenceLedger
        })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        status: "empty",
        count: 0,
        leads: [],
        prospectName: `No live registry records found for "${queryInput}"`,
        location: "FL",
        score: 0,
        priority: "LOW PRIORITY",
        reasons: ["Provider query yielded 0 candidate records."],
        evidenceLedger: null
      })
    };

  } catch (error) {
    console.error("Live Pipeline Failure inside Netlify Handler:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "Pipeline Execution Exception",
        message: error.message
      })
    };
  }
};
