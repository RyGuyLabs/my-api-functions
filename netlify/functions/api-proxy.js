const fetch = require('node-fetch').default || require('node-fetch');

const SQUARESPACE_TOKEN = process.env.SQUARESPACE_ACCESS_TOKEN;
const FIRESTORE_KEY = process.env.DATA_API_KEY;
const PROJECT_ID = process.env.FIRESTORE_PROJECT_ID;
const GEMINI_API_KEY = process.env.FIRST_API_KEY;

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

const GLOBAL_OPERATIONAL_CONTRACT = `
You are a high-reliability, API-only backend processing engine. 

CORE OPERATIONAL RULES:
1. JSON INTEGRITY: If JSON is requested, the response MUST start with '{' and end with '}'. No whitespace or markdown blocks.
2. SCHEMA COMPLETENESS: Every requested key must be present. Do not omit or merge fields.
3. FAIL-SAFE: If constraints cannot be satisfied or input is nonsensical, return ONLY an empty object {} and nothing else.
4. NULL INTENT: If a field has no viable data based on context, return "INSUFFICIENT_CONTEXT" instead of an empty string.
5. DISCIPLINE: No apologies, no disclaimers, no meta-commentary.
6. VERIFICATION: Internally verify all rules before outputting the final character.
`;

const SYSTEM_INSTRUCTIONS = {
  "plan": `Role: Action Planner (RyGuy). Objective: 10–12 step plan. Rules: Base steps on goal AND emotional resistance. Progress from low-risk to high-impact. Return ONLY JSON: {"steps": [{"title": "string", "details": "string"}]}`,
  "pep_talk": `Role: Motivational Speaker (RyGuy). Rules: Max 300 chars. Mirror emotion, then redirect. Concise language. Raw text only.`,
  "obstacle_analysis": `Role: Strategic Consultant (RyGuy). Rules: 1-3 obstacles. One paragraph each with strategy. Separate with blank lines. No lists. Raw text only.`,
  "positive_spin": `Role: Optimistic Reframer (RyGuy). Rules: Single paragraph reframing negative to positive. Raw text only.`,
  "mindset_reset": `Role: Pragmatic Mindset Coach (RyGuy). Rules: One practical mental adjustment. One paragraph. Raw text only.`,
  "objection_handler": `Role: Sales Trainer (RyGuy). Rules: Acknowledge objection, provide strategy. One paragraph. Raw text only.`,
  "smart_goal_structuring": `Role: R.E.A.D.Y. Framework Architect. Rules: Populate R, E, A, D, Y keys. Each must have: title, description, theme, motivation, exampleAction, aiGuidance (Strategic Why), aiTip (Tactical How <20 words). Parity: D and Y must be as detailed as R and E.`
};

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
    if (value === null || value === undefined) {
        return { nullValue: null };
    }
    if (typeof value === 'string') {
        return { stringValue: value };
    }
    if (typeof value === 'number') {
        return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
    }
    if (typeof value === 'boolean') {
        return { booleanValue: value };
    }
    if (Array.isArray(value)) {
        return {
            arrayValue: {
                values: value.map(jsToFirestoreRest)
            }
        };
    }
    if (typeof value === 'object') {
        const mapFields = {};
        for (const key in value) {
            if (Object.prototype.hasOwnProperty.call(value, key)) {
                mapFields[key] = jsToFirestoreRest(value[key]);
            }
        }
        return { mapValue: { fields: mapFields } };
    }
    return { stringValue: String(value) };
}

function firestoreRestToJs(firestoreField) {
    if (!firestoreField) return null;
    if (firestoreField.nullValue !== undefined) return null;
    if (firestoreField.stringValue !== undefined) return firestoreField.stringValue;
    if (firestoreField.integerValue !== undefined) return parseInt(firestoreField.integerValue, 10);
    if (firestoreField.doubleValue !== undefined) return firestoreField.doubleValue;
    if (firestoreField.booleanValue !== undefined) return firestoreField.booleanValue;
    if (firestoreField.timestampValue !== undefined) return new Date(firestoreField.timestampValue);
    if (firestoreField.arrayValue) {
        return (firestoreField.arrayValue.values || []).map(firestoreRestToJs);
    }
    if (firestoreField.mapValue) {
        const jsObject = {};
        const fields = firestoreField.mapValue.fields || {};
        for (const key in fields) {
            if (Object.prototype.hasOwnProperty.call(fields, key)) {
                jsObject[key] = firestoreRestToJs(fields[key]);
            }
        }
        return jsObject;
    }
    return null;
}

async function checkSquarespaceMembershipStatus(userId) {
    if (userId.startsWith('mock-') || userId === 'TEST_USER') {
        console.log(`[AUTH-MOCK] Bypassing Squarespace check for mock user: ${userId}`);
        return true;
    }
    if (!SQUARESPACE_TOKEN) {
        console.error("SQUARESPACE_ACCESS_TOKEN is missing. Blocking all data access.");
        return false;
    }
    const squarespaceApiUrl = `https://api.squarespace.com/1.0/profiles/check-membership/${userId}`;
    try {
        const response = await retryFetch(squarespaceApiUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${SQUARESPACE_TOKEN}`,
                'User-Agent': 'RyGuyLabs-Netlify-Function-Checker'
            }
        });
        if (!response.ok) {
            console.warn(`Squarespace API returned error for user ${userId}: ${response.status} - ${response.statusText}`);
            return false;
        }
        const data = await response.json();
        const isActive = data?.membershipStatus === 'ACTIVE' || data?.subscription?.status === 'ACTIVE';
        if (!isActive) {
            console.log(`User ${userId} is INACTIVE. Access denied.`);
        }
        return isActive;
    } catch (error) {
        console.error("Error checking Squarespace membership:", error);
        return false;
    }
}

exports.handler = async (event, context) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: CORS_HEADERS, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: "Method Not Allowed" })
        };
    }

    if (!GEMINI_API_KEY || GEMINI_API_KEY.trim() === '') {
        return {
            statusCode: 500,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: 'AI API Key (FIRST_API_KEY) is not configured.' })
        };
    }

    if (!FIRESTORE_KEY || !PROJECT_ID) {
        return {
            statusCode: 500,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: 'Firestore keys (DATA_API_KEY or FIRESTORE_PROJECT_ID) are missing. Cannot access database.' })
        };
    }

    try {
        const body = JSON.parse(event.body);
        const { action, userId, data, userGoal, textToSpeak, imagePrompt, emotionalFocus } = body;
        const feature = action || body.feature;

        if (!feature) {
            return {
                statusCode: 400,
                headers: CORS_HEADERS,
                body: JSON.stringify({ message: "Missing required 'action' parameter." })
            };
        }

        // --- SECTION 1: DATA OPERATIONS ---
        if (DATA_OPERATIONS.includes(feature.toUpperCase())) {
            if (!userId) {
                return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ message: "Unauthorized: Missing userId for data access." }) };
            }
            const isSubscriberActive = await checkSquarespaceMembershipStatus(userId);
            if (!isSubscriberActive) {
                return {
                    statusCode: 403,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ message: "Forbidden: No active RyGuyLabs membership found." })
                };
            }

            const userDreamsCollectionPath = `users/${userId}/dreams`;
            let firestoreResponse;

            switch (feature.toUpperCase()) {
                case 'SAVE_DREAM':
                    if (!data) return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: "Missing data." }) };
                    const dataWithTimestamp = { ...data, timestamp: new Date().toISOString() };
                    const firestoreFields = jsToFirestoreRest(dataWithTimestamp).mapValue.fields;
                    firestoreResponse = await retryFetch(`${FIRESTORE_BASE_URL}${userDreamsCollectionPath}?key=${FIRESTORE_KEY}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ fields: firestoreFields })
                    });
                    if (firestoreResponse.ok) {
                        return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true, message: "Dream saved." }) };
                    }
                    break;

                case 'LOAD_DREAMS':
                    const structuredQuery = {
                        select: { fields: [{ fieldPath: "*" }] },
                        from: [{ collectionId: "dreams" }],
                        orderBy: [{ field: { fieldPath: "timestamp" }, direction: "DESCENDING" }]
                    };
                    firestoreResponse = await retryFetch(FIRESTORE_QUERY_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ parent: `projects/${PROJECT_ID}/databases/(default)/documents/users/${userId}`, structuredQuery: structuredQuery })
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
                    if (!data || !data.dreamId) return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: "Missing dreamId." }) };
                    firestoreResponse = await retryFetch(`${FIRESTORE_BASE_URL}users/${userId}/dreams/${data.dreamId}?key=${FIRESTORE_KEY}`, {
                        method: 'DELETE'
                    });
                    if (firestoreResponse.ok) {
                        return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true }) };
                    }
                    break;
            }
            const errorText = firestoreResponse ? await firestoreResponse.text() : 'Unknown error';
            return { statusCode: firestoreResponse?.status || 500, headers: CORS_HEADERS, body: JSON.stringify({ message: "Database failure.", details: errorText }) };
        }

        // --- SECTION 2: AI GENERATION ---
        const generateImage = async (prompt, key) => {
            const IMAGEN_MODEL = "gemini-2.5-flash-image-preview";
            const URL = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGEN_MODEL}:generateContent?key=${key}`;
            const payload = { contents: [{ parts: [{ text: prompt }] }] };
            const res = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (!res.ok) throw new Error(`Image API failed: ${res.status}`);
            const result = await res.json();
            const base64 = result?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
            if (!base64) throw new Error("No image data.");
            return `data:image/png;base64,${base64}`;
        };

        if (feature === 'image_generation') {
            const imageUrl = await generateImage(imagePrompt, GEMINI_API_KEY);
            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ imageUrl }) };
        }

        if (feature === 'tts') {
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

        if (feature === 'prime_directive') {
            const SYSTEM = `You are a masculine executive coach. Return ONLY JSON: {"image_prompt": "string", "command_text": "string"}`;
            const URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
            const res = await retryFetch(URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: `Goal: ${userGoal}. Focus: ${emotionalFocus}` }] }], systemInstruction: { parts: [{ text: SYSTEM }] }, generationConfig: { responseMimeType: "application/json" } })
            });
            const result = await res.json();
            const parsed = JSON.parse(result.candidates[0].content.parts[0].text);
            const imageUrl = await generateImage(parsed.image_prompt, GEMINI_API_KEY);
            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ ...parsed, imageUrl }) };
        }

        if (feature === 'BREAK_BARRIER' || feature === 'dream_energy_analysis') {
            const SYSTEM = `You are an Ultimate Executive Coach. Return ONLY JSON with keys: internalConflict, externalPrescription, summaryInsight, emotionalCounterStrategy (100+ words), threeStepActionTrek (array).`;
            const URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
            const res = await retryFetch(URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: `Goal: ${userGoal}. Focus: ${emotionalFocus}` }] }], systemInstruction: { parts: [{ text: SYSTEM }] }, generationConfig: { responseMimeType: "application/json" } })
            });
            const result = await res.json();
            return { statusCode: 200, headers: CORS_HEADERS, body: result.candidates[0].content.parts[0].text };
        }

        if (TEXT_GENERATION_FEATURES.includes(feature)) {
            const URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
            const res = await retryFetch(URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: userGoal }] }], systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTIONS[feature] }] } })
            });
            const result = await res.json();
            const text = result.candidates[0].content.parts[0].text;
            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ text }) };
        }

        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: "Invalid action." }) };
    } catch (error) {
        return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ message: error.message }) };
    }
};
