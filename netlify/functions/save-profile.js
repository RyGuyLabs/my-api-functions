const admin = require("firebase-admin");

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
    });
}

const db = admin.firestore();

exports.handler = async (event) => {
    if (event.httpMethod !== "POST") {
        return {
            statusCode: 405,
            body: "Method Not Allowed"
        };
    }

    try {
        const body = JSON.parse(event.body);

        const { careers, primary } = body;

        // 🔒 BASIC VALIDATION
        if (!careers || !primary) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: "Missing data" })
            };
        }

        // 🧠 OPTIONAL: limit size (prevents abuse)
        if (JSON.stringify(body).length > 50000) {
            return {
                statusCode: 413,
                body: JSON.stringify({ error: "Payload too large" })
            };
        }

        await db.collection("careerProfiles").add({
            careers,
            primary,
            createdAt: new Date()
        });

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true })
        };

    } catch (err) {
        console.error("Save error:", err);

        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Internal error" })
        };
    }
};
