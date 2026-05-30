const admin = require("firebase-admin");

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(
            JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
        )
    });
}

const db = admin.firestore();

exports.handler = async (event) => {

    const headers = {
        "Access-Control-Allow-Origin": "https://www.ryguylabs.com",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json"
    };

    if (event.httpMethod === "OPTIONS") {
        return {
            statusCode: 204,
            headers,
            body: ""
        };
    }

    try {

        const body = JSON.parse(event.body || "{}");

        const userEmail = body.userEmail;

        const doc = await db.collection("career_profiles")
            .doc(userEmail)
            .get();

        if (!doc.exists) {

            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({
                    error: "No profile found"
                })
            };
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(doc.data())
        };

    } catch (err) {

        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: err.message
            })
        };
    }
};
