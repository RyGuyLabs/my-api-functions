// record-acceptance.js
const admin = require("firebase-admin");

// ===== INIT FIREBASE (SAFE SINGLE INIT) =====
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
  });
}

const db = admin.firestore();

const SECRET = process.env.RG_TERMS_SECRET;

exports.handler = async (event) => {
  try {

    // ===== SECRET PROTECTION FOR WRITE =====
    if (event.httpMethod === "POST") {
      if (event.headers["x-rg-secret"] !== SECRET) {
        return { statusCode: 403, body: "Forbidden" };
      }
    }

    // ===== USER IDENTITY (COURT FOOTPRINT SAFE) =====
    const ip =
      event.headers["client-ip"] ||
      event.headers["x-forwarded-for"] ||
      event.headers["cf-connecting-ip"] ||
      "unknown";

    const acceptanceRef = db.collection("terms_acceptance").doc(ip);

    // ===== CHECK MODE =====
    if (event.queryStringParameters?.check) {
      const doc = await acceptanceRef.get();

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accepted: doc.exists })
      };
    }

    // ===== RECORD MODE =====
    if (event.httpMethod === "POST") {
      const data = JSON.parse(event.body || "{}");

      await acceptanceRef.set({
        ip,
        acceptedAt: new Date().toISOString(),
        userAgent: data.userAgent || null,
        page: data.page || null,
        referrer: data.referrer || null,
        serverTimestamp: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      return {
        statusCode: 200,
        body: JSON.stringify({ success: true })
      };
    }

    return { statusCode: 405 };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server Error" })
    };
  }
};
