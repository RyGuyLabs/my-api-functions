const admin = require("firebase-admin");

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
    });
}

const db = admin.firestore();

exports.handler = async (event) => {
    // 1. Define the "Key" to the gate
    const headers = {
        "Access-Control-Allow-Origin": "https://www.ryguylabs.com",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json"
    };

    // 2. Handle the Preflight Handshake (Critical for Squarespace)
    if (event.httpMethod === "OPTIONS") {
        return {
            statusCode: 204, // No Content
            headers,
            body: ""
        };
    }

    // 3. Only allow POST for the actual save logic
    if (event.httpMethod !== "POST") {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: "Method Not Allowed" })
        };
    }

    try {
        const body = JSON.parse(event.body || "{}");
        const { careers, primary } = body;

        // BASIC VALIDATION
        if (!careers || !primary) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: "Missing data" })
            };
        }

        // Payload size limit
        if (JSON.stringify(body).length > 50000) {
            return {
                statusCode: 413,
                headers,
                body: JSON.stringify({ error: "Payload too large" })
            };
        }

        // SAVE TO FIRESTORE
        await db.collection("careerProfiles").add({
            careers,
            primary,
            createdAt: new Date()
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true })
        };

    } catch (err) {
        console.error("Save error:", err);

        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "Internal error", message: err.message })
        };
    }
};
