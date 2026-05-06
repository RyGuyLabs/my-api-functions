const admin = require("firebase-admin");

// 1. INITIALIZE FIREBASE (The Bridge)
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
    });
}
const db = admin.firestore();

// 2. HELPER FUNCTIONS (Your Logic)
function calculateFitBoost(career, signals) {
    const title = career.careerTitle.toLowerCase();
    let boost = 0;
    const matchesTechnical = signals.technical && /(engineer|developer|software|tech)/.test(title);
    const matchesCreative = signals.creative && /(design|writer|artist|content)/.test(title);
    const matchesAnalytical = signals.analytical && /(analyst|data|research)/.test(title);
    const matchesInterpersonal = signals.interpersonal && /(sales|manager|coach|teacher)/.test(title);
    const matchesPhysical = signals.physical && /(mechanic|construction|fitness|labor)/.test(title);

    const matchCount = [matchesTechnical, matchesCreative, matchesAnalytical, matchesInterpersonal, matchesPhysical].filter(Boolean).length;
    if (matchCount === 1) boost = 1;
    else if (matchCount === 2) boost = 3;
    else if (matchCount >= 3) boost = 5;
    return boost;
}

function generateEarnings(score, title, country) {
    const t = (title || "").toLowerCase();
    const loc = (country || "").toLowerCase();
    let base = 55000;

    if (/(engineer|developer|software)/.test(t)) base = 85000;
    else if (/(data|analyst|research)/.test(t)) base = 70000;
    else if (/(sales|manager|consult)/.test(t)) base = 65000;
    else if (/(design|creative|writer|content)/.test(t)) base = 50000;
    else if (/(mechanic|construction|labor)/.test(t)) base = 45000;

    let multiplier = 1;
    if (/united states|usa|florida/.test(loc)) multiplier = 1.25;
    else if (/canada|uk|australia/.test(loc)) multiplier = 1.15;

    const modifier = 1 + (score - 70) / 200;
    const mid = Math.round(base * multiplier * modifier);
    
    return {
        earningEntry: `$${Math.round(mid * 0.8).toLocaleString()}`,
        earningMid: `$${mid.toLocaleString()}`,
        earningCeiling: `$${Math.round(mid * 1.8).toLocaleString()}`,
        earningPotential: `$${mid.toLocaleString()} avg`
    };
}

// 3. THE MAIN HANDLER
exports.handler = async (event) => {
    // Standard Headers for RyGuy Labs
    const headers = {
        "Access-Control-Allow-Origin": "https://www.ryguylabs.com",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, x-nf-client-connection-ip",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json"
    };

    // Handle Preflight (Options)
    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 204, headers, body: "" };
    }

    if (event.httpMethod !== "POST") {
        return { statusCode: 405, headers, body: JSON.stringify({ error: "Method Not Allowed" }) };
    }

    try {
        const body = JSON.parse(event.body || "{}");
        const ip = event.headers["x-nf-client-connection-ip"] || "unknown";

        // SAVE TO FIRESTORE
        const docRef = await db.collection("career_interactions").add({
            ...body,
            userIp: ip,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, id: docRef.id })
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
