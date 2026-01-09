// Use globalThis.fetch to avoid name mangling issues like 'fetch2 is not a function'
// in bundled environments like Netlify.
const nativeFetch = globalThis.fetch;

// Environment Variables
const SQUARESPACE_TOKEN = process.env.SQUARESPACE_ACCESS_TOKEN;
const FIRESTORE_KEY = process.env.DATA_API_KEY;
const PROJECT_ID = process.env.FIRESTORE_PROJECT_ID;
const GEMINI_API_KEY = process.env.FIRST_API_KEY;

// API Endpoints
const FIRESTORE_BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/`;
const FIRESTORE_QUERY_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery?key=${FIRESTORE_KEY}`;

const DATA_OPERATIONS = ['SAVE_DREAM', 'LOAD_DREAMS', 'DELETE_DREAM'];
const TEXT_GENERATION_FEATURES = [
    "plan", "pep_talk", "obstacle_analysis",
    "positive_spin", "mindset_reset", "objection_handler",
    "smart_goal_structuring"
];

const SYSTEM_INSTRUCTIONS = {
    "plan": `You are a world-class life coach named RyGuy. Your tone is supportive and actionable. Create a step-by-step action plan with 10–12 major milestones. Return STRICTLY JSON: { "steps": [{ "title": "...", "details": "..." }] }`,
    "pep_talk": "You are a motivational speaker named RyGuy. Write a powerful pep talk in 300 characters or less.",
    "obstacle_analysis": "Identify up to three potential obstacles and provide practical strategies to overcome them.",
    "positive_spin": "Rewrite negative statements into a single paragraph highlighting opportunities.",
    "mindset_reset": "Provide a brief, practical mindset reset in one paragraph.",
    "objection_handler": "Respond to a sales objection in a single strategic paragraph.",
    "smart_goal_structuring": `You are a holistic goal-setting specialist named RyGuy. Help the user transform their dream using the R.E.A.D.Y. framework (Reflect, Execute, Assess, Dial In, Yield). Return JSON with keys R, E, A, D, Y.`
};

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': 'https://www.ryguylabs.com',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Gemini-Model',
    'Content-Type': 'application/json'
};

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

// --- Helper Functions ---

async function retryFetch(url, options, maxRetries = MAX_RETRIES) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            // Explicitly use nativeFetch mapped to globalThis.fetch
            const response = await nativeFetch(url, options);
            if (response.status === 429 || response.status >= 500) {
                if (i === maxRetries - 1) throw new Error(`Fetch failed after ${maxRetries} retries with status ${response.status}`);
                const delay = RETRY_DELAY_MS * Math.pow(2, i);
                await new Promise(r => setTimeout(r, delay));
                continue;
            }
            return response;
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            const delay = RETRY_DELAY_MS * Math.pow(2, i);
            await new Promise(r => setTimeout(r, delay));
        }
    }
}

function jsToFirestoreRest(value) {
    if (value === null || value === undefined) return { nullValue: null };
    if (typeof value === 'string') return { stringValue: value };
    if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
    if (typeof value === 'boolean') return { booleanValue: value };
    if (Array.isArray(value)) return { arrayValue: { values: value.map(jsToFirestoreRest) } };
    if (typeof value === 'object') {
        const fields = {};
        for (const k in value) fields[k] = jsToFirestoreRest(value[k]);
        return { mapValue: { fields } };
    }
    return { stringValue: String(value) };
}

function firestoreRestToJs(field) {
    if (!field) return null;
    if (field.nullValue !== undefined) return null;
    if (field.stringValue !== undefined) return field.stringValue;
    if (field.integerValue !== undefined) return parseInt(field.integerValue, 10);
    if (field.doubleValue !== undefined) return field.doubleValue;
    if (field.booleanValue !== undefined) return field.booleanValue;
    if (field.timestampValue !== undefined) return new Date(field.timestampValue);
    if (field.arrayValue) return (field.arrayValue.values || []).map(firestoreRestToJs);
    if (field.mapValue) {
        const obj = {};
        const fields = field.mapValue.fields || {};
        for (const k in fields) obj[k] = firestoreRestToJs(fields[k]);
        return obj;
    }
    return null;
}

const generateImage = async (imagePrompt, GEMINI_API_KEY) => {
    if (!imagePrompt) throw new Error('Missing "imagePrompt" for image generation.');
    
    const IMAGEN_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${GEMINI_API_KEY}`;
    
    const geminiImagePayload = {
        contents: [{
            parts: [{ text: imagePrompt }]
        }],
        generationConfig: {
            responseModalities: ['TEXT', 'IMAGE']
        }
    };

    const response = await nativeFetch(IMAGEN_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiImagePayload)
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error("Gemini API Error:", response.status, errorBody);
        throw new Error(`Gemini API failed with status ${response.status}`);
    }

    const result = await response.json();
    const base64Data = result?.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;

    if (!base64Data) throw new Error("Gemini Image API response did not contain image data.");

    return `data:image/png;base64,${base64Data}`;
};

// --- Main Handler ---

exports.handler = async (event, context) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS_HEADERS, body: '' };
    if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ message: "Method Not Allowed" }) };

    try {
        const body = JSON.parse(event.body);
        const { action, userId, data, userGoal, textToSpeak, imagePrompt, emotionalFocus } = body;
        const feature = (action || body.feature || "").toLowerCase();

        // System Checks
        if (feature === 'get_config') {
            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({
                    apiKey: FIRESTORE_KEY,
                    authDomain: `${PROJECT_ID}.firebaseapp.com`,
                    projectId: PROJECT_ID,
                    appId: process.env.FIREBASE_APP_ID || ""
                })
            };
        }

        // --- Data Operations ---
        if (DATA_OPERATIONS.includes(feature.toUpperCase())) {
            if (!userId) return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ message: "Unauthorized" }) };
            
            let firestoreResponse;
            switch (feature.toUpperCase()) {
                case 'SAVE_DREAM':
                    const saveFields = jsToFirestoreRest({ ...data, timestamp: new Date().toISOString() }).mapValue.fields;
                    firestoreResponse = await retryFetch(`${FIRESTORE_BASE_URL}users/${userId}/dreams?key=${FIRESTORE_KEY}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ fields: saveFields })
                    });
                    if (firestoreResponse.ok) {
                        return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true }) };
                    }
                    break;

                case 'LOAD_DREAMS':
                    const structuredQuery = {
                        select: { fields: [{ fieldPath: "*" }] },
                        from: [{ collectionId: "dreams" }], 
                        orderBy: [{
                            field: { fieldPath: "timestamp" },
                            direction: "DESCENDING"
                        }]
                    };

                    firestoreResponse = await retryFetch(FIRESTORE_QUERY_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ parent: `projects/${PROJECT_ID}/databases/(default)/documents/users/${userId}`, structuredQuery: structuredQuery })
                    });

                    if (firestoreResponse.ok) {
                        const result = await firestoreResponse.json();
                        const dreams = (result || [])
                            .filter(item => item.document) 
                            .map(item => {
                                const doc = item.document;
                                const docId = doc.name.split('/').pop();
                                const fields = firestoreRestToJs({ mapValue: { fields: doc.fields } });
                                return { id: docId, ...fields };
                            });

                        return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ dreams }) };
                    }
                    break;

                case 'DELETE_DREAM':
                    if (!data?.dreamId) return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: "Missing dreamId." }) };
                    firestoreResponse = await retryFetch(`${FIRESTORE_BASE_URL}users/${userId}/dreams/${data.dreamId}?key=${FIRESTORE_KEY}`, {
                        method: 'DELETE'
                    });
                    if (firestoreResponse.ok) return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true }) };
                    break;

                default:
                    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: "Invalid action." }) };
            }
        }

        // --- AI Features ---
        if (feature === 'image_generation') {
            const imageUrl = await generateImage(imagePrompt, GEMINI_API_KEY);
            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ imageUrl, altText: imagePrompt }) };
        }

        else if (feature === 'tts') {
            if (!textToSpeak) return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Missing text.' }) };

            const ttsPayload = {
                contents: [{ parts: [{ text: textToSpeak }] }],
                generationConfig: {
                    responseModalities: ["AUDIO"],
                    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Achird" } } }
                }
            };

            const response = await retryFetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(ttsPayload)
            });

            const result = await response.json();
            const part = result?.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({ audioData: part.inlineData.data, mimeType: part.inlineData.mimeType })
            };
        }

        else if (feature === 'prime_directive') {
            const TEXT_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
            const userPrompt = `GOAL: ${userGoal}. EMOTIONAL ANCHOR: ${emotionalFocus}.`;

            const payload = {
                contents: [{ parts: [{ text: userPrompt }] }],
                systemInstruction: { parts: [{ text: "You are an executive coach. Return JSON: { \"image_prompt\": \"...\", \"command_text\": \"...\" }" }] },
                generationConfig: { temperature: 0.2, responseMimeType: "application/json" }
            };

            const response = await retryFetch(TEXT_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();
            const parsedContent = JSON.parse(result.candidates[0].content.parts[0].text);
            const imageUrl = await generateImage(parsedContent.image_prompt, GEMINI_API_KEY);

            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({ ...parsedContent, imageUrl })
            };
        }

        else if (feature === 'break_barrier' || feature === 'dream_energy_analysis') {
            const TEXT_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
            const payload = {
                contents: [{ parts: [{ text: `Analyze goal: ${userGoal}` }] }],
                systemInstruction: { parts: [{ text: "Return JSON with: internalConflict, externalPrescription, summaryInsight, emotionalCounterStrategy, threeStepActionTrek." }] },
                generationConfig: { temperature: 0.7, responseMimeType: "application/json" }
            };

            const response = await retryFetch(TEXT_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();
            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: result.candidates[0].content.parts[0].text
            };
        }

        else if (TEXT_GENERATION_FEATURES.includes(feature)) {
            const TEXT_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
            const isJsonFeature = ["plan", "smart_goal_structuring"].includes(feature);
            
            const payload = {
                contents: [{ parts: [{ text: userGoal }] }],
                systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTIONS[feature] }] },
                generationConfig: isJsonFeature ? { responseMimeType: "application/json" } : {}
            };

            const response = await retryFetch(TEXT_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();
            const rawText = result.candidates[0].content.parts[0].text;
            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({ [feature]: isJsonFeature ? JSON.parse(rawText) : rawText })
            };
        }

        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: "Invalid action." }) };

    } catch (error) {
        console.error("Internal server error:", error);
        return {
            statusCode: 500,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: `Internal server error: ${error.message}` })
        };
    }
};
