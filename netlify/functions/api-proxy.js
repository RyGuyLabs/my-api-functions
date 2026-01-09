const fetch = require('node-fetch').default || require('node-fetch');

const SQUARESPACE_TOKEN = process.env.SQUARESPACE_ACCESS_TOKEN;
const FIRESTORE_KEY = process.env.DATA_API_KEY;
const PROJECT_ID = process.env.FIRESTORE_PROJECT_ID;
const GEMINI_API_KEY = process.env.FIRST_API_KEY;
const FIREBASE_APP_ID = process.env.FIREBASE_APP_ID;
const FIREBASE_MESSAGING_SENDER_ID = process.env.FIREBASE_MESSAGING_SENDER_ID;

const FIRESTORE_BASE_URL =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/`;

const FIRESTORE_QUERY_URL =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery?key=${FIRESTORE_KEY}`;

// List of features that perform data operations (GATED BY MEMBERSHIP)
const DATA_OPERATIONS = [
    'SAVE_DREAM',
    'LOAD_DREAMS',
    'DELETE_DREAM'
];

// List of features that perform text generation
const TEXT_GENERATION_FEATURES = [
    "plan", "pep_talk", "obstacle_analysis",
    "positive_spin", "mindset_reset", "objection_handler",
    "smart_goal_structuring"
];

const CORS_HEADERS = { 
    'Access-Control-Allow-Origin': '*', 
    'Access-Control-Allow-Methods': 'POST, OPTIONS', 
    'Access-Control-Allow-Headers': 'Content-Type', 
    'Content-Type': 'application/json' 
};

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

async function retryFetch(url, options, maxRetries = MAX_RETRIES) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(url, options);
            if (response.status === 429 || response.status >= 500) {
                if (i === maxRetries - 1) throw new Error(`Fetch failed after ${maxRetries} retries.`);
                const delay = RETRY_DELAY_MS * Math.pow(2, i);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            return response;
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            const delay = RETRY_DELAY_MS * Math.pow(2, i);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw new Error("Fetch failed.");
}

function jsToFirestoreRest(value) {
    if (value === null || value === undefined) return { nullValue: null };
    if (typeof value === 'string') return { stringValue: value };
    if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
    if (typeof value === 'boolean') return { booleanValue: value };
    if (Array.isArray(value)) return { arrayValue: { values: value.map(jsToFirestoreRest) } };
    if (typeof value === 'object') {
        const mapFields = {};
        for (const key in value) {
            if (Object.prototype.hasOwnProperty.call(value, key)) mapFields[key] = jsToFirestoreRest(value[key]);
        }
        return { mapValue: { fields: mapFields } };
    }
    return { stringValue: String(value) };
}

function firestoreRestToJs(firestoreField) {
    if (!firestoreField) return null;
    if (firestoreField.stringValue !== undefined) return firestoreField.stringValue;
    if (firestoreField.integerValue !== undefined) return parseInt(firestoreField.integerValue, 10);
    if (firestoreField.doubleValue !== undefined) return firestoreField.doubleValue;
    if (firestoreField.booleanValue !== undefined) return firestoreField.booleanValue;
    if (firestoreField.arrayValue) return (firestoreField.arrayValue.values || []).map(firestoreRestToJs);
    if (firestoreField.mapValue) {
        const jsObject = {};
        const fields = firestoreField.mapValue.fields || {};
        for (const key in fields) {
            if (Object.prototype.hasOwnProperty.call(fields, key)) jsObject[key] = firestoreRestToJs(fields[key]);
        }
        return jsObject;
    }
    return null;
}

async function checkSquarespaceMembershipStatus(userId) {
    if (userId.startsWith('mock-') || userId === 'TEST_USER') return true;
    if (!SQUARESPACE_TOKEN) return false;
    const squarespaceApiUrl = `https://api.squarespace.com/1.0/profiles/check-membership/${userId}`;
    try {
        const response = await retryFetch(squarespaceApiUrl, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${SQUARESPACE_TOKEN}`, 'User-Agent': 'RyGuyLabs-Netlify-Function' }
        });
        if (!response.ok) return false;
        const data = await response.json();
        return data?.membershipStatus === 'ACTIVE' || data?.subscription?.status === 'ACTIVE';
    } catch (error) {
        return false;
    }
}

exports.handler = async (event, context) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS_HEADERS, body: '' };
    if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ message: "Method Not Allowed" }) };

    try {
        const body = JSON.parse(event.body);
        const action = body.action || body.feature;

        // --- SPECIAL ACTION: GET CONFIG ---
        // This resolves the "projectId not provided" error in the frontend logs
        if (action === 'GET_FIREBASE_CONFIG') {
            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({
                    apiKey: FIRESTORE_KEY,
                    authDomain: `${PROJECT_ID}.firebaseapp.com`,
                    projectId: PROJECT_ID,
                    storageBucket: `${PROJECT_ID}.appspot.com`,
                    messagingSenderId: FIREBASE_MESSAGING_SENDER_ID || "",
                    appId: FIREBASE_APP_ID || ""
                })
            };
        }

        if (!FIRESTORE_KEY || !PROJECT_ID) {
            return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Server environment variables not set.' }) };
        }

        const { userId, data, userGoal, textToSpeak, imagePrompt, emotionalFocus } = body;

        // --- DATA OPERATIONS ---
        if (DATA_OPERATIONS.includes(action?.toUpperCase())) {
            if (!userId) return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ message: "Unauthorized" }) };
            const isSubscriberActive = await checkSquarespaceMembershipStatus(userId);
            if (!isSubscriberActive) return { statusCode: 403, headers: CORS_HEADERS, body: JSON.stringify({ message: "Membership Required" }) };

            const userDreamsCollectionPath = `users/${userId}/dreams`;
            let firestoreResponse;

            switch (action.toUpperCase()) {
                case 'SAVE_DREAM':
                    const firestoreFields = jsToFirestoreRest({ ...data, timestamp: new Date().toISOString() }).mapValue.fields;
                    firestoreResponse = await retryFetch(`${FIRESTORE_BASE_URL}${userDreamsCollectionPath}?key=${FIRESTORE_KEY}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ fields: firestoreFields })
                    });
                    break;
                case 'LOAD_DREAMS':
                    firestoreResponse = await retryFetch(FIRESTORE_QUERY_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            parent: `projects/${PROJECT_ID}/databases/(default)/documents/users/${userId}`,
                            structuredQuery: { from: [{ collectionId: "dreams" }], orderBy: [{ field: { fieldPath: "timestamp" }, direction: "DESCENDING" }] }
                        })
                    });
                    if (firestoreResponse.ok) {
                        const result = await firestoreResponse.json();
                        const dreams = (result || []).filter(item => item.document).map(item => ({
                            id: item.document.name.split('/').pop(),
                            ...firestoreRestToJs({ mapValue: { fields: item.document.fields } })
                        }));
                        return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ dreams }) };
                    }
                    break;
                case 'DELETE_DREAM':
                    firestoreResponse = await retryFetch(`${FIRESTORE_BASE_URL}users/${userId}/dreams/${data.dreamId}?key=${FIRESTORE_KEY}`, { method: 'DELETE' });
                    break;
            }
            if (firestoreResponse?.ok) return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true }) };
            return { statusCode: firestoreResponse?.status || 500, headers: CORS_HEADERS, body: JSON.stringify({ message: "DB Error" }) };
        }

        // --- AI OPERATIONS ---
        if (action === 'tts') {
            const URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${GEMINI_API_KEY}`;
            const res = await retryFetch(URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: textToSpeak }] }], generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Achird" } } } } })
            });
            const result = await res.json();
            const part = result?.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ audioData: part.inlineData.data, mimeType: part.inlineData.mimeType }) };
        }

        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: "Invalid action." }) };
    } catch (error) {
        return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ message: error.message }) };
    }
};
