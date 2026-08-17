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

// ============================================================================
// RYGUY LABS LEAD ENGINE EXTENSION (Added below existing mintCustomToken)
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
