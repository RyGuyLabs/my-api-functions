// Required for making external HTTP requests in Netlify/Node environments
const fetch = require('node-fetch').default || require('node-fetch');

// --- 1. Global Constants (Using your specified environment variable names) ---
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// IMPORTANT: Using the environment variable names you provided
const SQUARESPACE_TOKEN = process.env.SQUARESPACE_ACCESS_TOKEN;
const FIRESTORE_KEY = process.env.DATA_API_KEY;
const PROJECT_ID = process.env.FIRESTORE_PROJECT_ID;
const GEMINI_API_KEY = process.env.FIRST_API_KEY; // Using FIRST_API_KEY as the source

// Firestore API Endpoints
const FIRESTORE_BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/`;
const FIRESTORE_QUERY_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery?key=${FIRESTORE_KEY}`;

// Feature Definitions
const DATA_OPERATIONS = ['SAVE_DREAM', 'LOAD_DREAMS', 'DELETE_DREAM'];
const TEXT_GENERATION_FEATURES = [
    'smart_goal_structuring',
    'dream_analysis',
    'ryguy_vision_mentor',
    'narrative_generation'
];

// System instructions for the Gemini model, keyed by the feature name
const SYSTEM_INSTRUCTIONS = {
    'dream_analysis': "You are a thoughtful, non-judgmental dream analyst. Analyze the user's dream by focusing on symbolic meaning, emotional resonance, and potential real-life connections. Provide a concise, clear analysis in 3-5 paragraphs, using markdown formatting for readability.",
    'ryguy_vision_mentor': "You are RyGuy, a high-energy, positive, and direct personal mentor. Your goal is to take the user's input and immediately break it down into the most critical next step they need to take. Use an encouraging, yet no-nonsense tone. Output should be a single paragraph summary followed by a numbered list of action items.",
    'narrative_generation': "You are a professional creative writer. Transform the user's goal or experience into an engaging, short narrative story or visualization that motivates them. Use vivid imagery and compelling language. The output should be a single story, presented in a clean markdown format.",
    // smart_goal_structuring uses a schema instead of a system instruction
};

// JSON Schema for SMART Goal Structuring
const SMART_GOAL_SCHEMA = {
    type: "OBJECT",
    properties: {
        goalTitle: { type: "STRING", description: "A concise, actionable title for the goal." },
        smartAnalysis: { type: "STRING", description: "A two-sentence summary of why this goal is a good fit for the SMART framework." },
        specific: { type: "STRING", description: "What exactly will be achieved? Who is involved? Where will this happen?" },
        measurable: { type: "STRING", description: "How will progress be tracked? What are the quantifiable results?" },
        achievable: { type: "STRING", description: "Is this goal realistic? What resources or skills are needed to achieve it?" },
        relevant: { type: "STRING", description: "Why is this important to the user right now? How does it align with their larger vision?" },
        timeBound: { type: "STRING", description: "What is the clear, final deadline and any necessary milestones?" },
    },
    required: ["goalTitle", "smartAnalysis", "specific", "measurable", "achievable", "relevant", "timeBound"]
};

// -----------------------------------------------------------------
// --- 2. Helper Functions ---
// -----------------------------------------------------------------

/**
 * Robust fetch wrapper that attempts a request multiple times on transient errors (FIX for reliability).
 */
async function fetchWithRetry(url, options, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, options);
            if (response.ok || (response.status !== 500 && response.status !== 503 && response.status !== 429)) {
                return response;
            }
            console.warn(`Attempt ${i + 1} failed with status ${response.status}. Retrying in ${2 ** i * 100}ms...`);
            await new Promise(resolve => setTimeout(resolve, 2 ** i * 100)); // Exponential backoff
        } catch (error) {
            console.error(`Fetch attempt ${i + 1} caught an error:`, error.message);
            if (i === retries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, 2 ** i * 100));
        }
    }
    throw new Error(`Fetch failed after ${retries} attempts.`);
}

/**
 * Converts a simple JS object to the Firestore REST API's MapValue format.
 */
function jsToFirestoreRest(value) {
    if (value === null) return { nullValue: null };
    switch (typeof value) {
        case 'string':
            return { stringValue: value };
        case 'number':
            if (Number.isInteger(value)) return { integerValue: value.toString() };
            return { doubleValue: value };
        case 'boolean':
            return { booleanValue: value };
        case 'object':
            if (Array.isArray(value)) {
                return { arrayValue: { values: value.map(jsToFirestoreRest) } };
            }
            // Map (object)
            const fields = {};
            for (const key in value) {
                if (Object.prototype.hasOwnProperty.call(value, key)) {
                    fields[key] = jsToFirestoreRest(value[key]);
                }
            }
            return { mapValue: { fields } };
        default:
            return { nullValue: null };
    }
}

/**
 * Converts a Firestore REST API MapValue object back to a simple JS object.
 */
function firestoreRestToJs(firestoreValue) {
    const type = Object.keys(firestoreValue)[0];
    const value = firestoreValue[type];

    switch (type) {
        case 'stringValue':
        case 'timestampValue':
            return value;
        case 'integerValue':
            return parseInt(value, 10);
        case 'doubleValue':
            return parseFloat(value);
        case 'booleanValue':
            return value;
        case 'nullValue':
            return null;
        case 'arrayValue':
            return (value.values || []).map(firestoreRestToJs);
        case 'mapValue':
            const obj = {};
            const fields = value.fields || {};
            for (const key in fields) {
                if (Object.prototype.hasOwnProperty.call(fields, key)) {
                    obj[key] = firestoreRestToJs(fields[key]);
                }
            }
            return obj;
        default:
            return null;
    }
}


/**
 * [CRITICAL SECURITY GATE] Checks the user's active membership status.
 */
async function checkSquarespaceMembershipStatus(userId) {
    // DEVELOPMENT BYPASS
    if (userId.startsWith('mock-') || userId === 'TEST_USER') {
        console.log(`[AUTH-MOCK] Bypassing Squarespace check for mock user: ${userId}`);
        return true;
    }

    if (!SQUARESPACE_TOKEN) {
        console.error("SQUARESPACE_ACCESS_TOKEN is missing. Blocking all data access.");
        return false;
    }

    // !! CRITICAL CUSTOMIZATION REQUIRED !!
    const squarespaceApiUrl = `https://api.squarespace.com/1.0/profiles/check-membership/${userId}`;

    try {
        const response = await fetch(squarespaceApiUrl, {
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

        // !! CRITICAL CUSTOMIZATION REQUIRED !!
        const isActive = data?.membershipStatus === 'ACTIVE' || data?.subscription?.status === 'ACTIVE';

        return isActive;

    } catch (error) {
        console.error("Error checking Squarespace membership:", error);
        return false; // Deny access on failure
    }
}

// -----------------------------------------------------------------
// --- 3. Main Handler Function ---
// -----------------------------------------------------------------

exports.handler = async function(event) {
    // Handle pre-flight OPTIONS requests for CORS
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: CORS_HEADERS,
            body: ''
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: "Method Not Allowed" })
        };
    }

    // --- API Key and Initialization Checks ---
    // Error message updated to reflect the key name used in the environment/config
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
        // Destructuring
        const { action, userId, data, userGoal, textToSpeak, imagePrompt, operation } = body;

        // Use 'operation' first, then fallback to existing 'action' or 'feature'
        const feature = operation || action || body.feature; 

        if (!feature) {
             return {
                 statusCode: 400,
                 headers: CORS_HEADERS,
                 body: JSON.stringify({ message: "Missing required 'action' or 'operation' parameter." })
             };
        }


        // ------------------------------------------------------------------
        // SECTION 1: DATA OPERATIONS (GATED BY SQUARESPACE MEMBERSHIP)
        // ------------------------------------------------------------------
        if (DATA_OPERATIONS.includes(feature.toUpperCase())) {

            if (!userId) {
                return {
                    statusCode: 401,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ message: "Unauthorized: Missing userId for data access." })
                };
            }

            // A. SUBSCRIPTION GATE CHECK (AUTHORIZATION)
            const isSubscriberActive = await checkSquarespaceMembershipStatus(userId);

            if (!isSubscriberActive) {
                return {
                    statusCode: 403,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({
                        message: "Forbidden: No active RyGuyLabs membership found. Please check your Squarespace subscription."
                    })
                };
            }

            // B. FIRESTORE DATA INTERACTION (SECURE ACCESS)
            const userDreamsCollectionPath = `users/${userId}/dreams`;
            let firestoreResponse;

            switch (feature.toUpperCase()) {
                case 'SAVE_DREAM':
                    if (!data) { return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: "Missing data to save." }) }; }

                    const firestoreFields = jsToFirestoreRest(data).mapValue.fields;

                    firestoreResponse = await fetch(`${FIRESTORE_BASE_URL}${userDreamsCollectionPath}?key=${FIRESTORE_KEY}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ fields: firestoreFields })
                    });

                    if (firestoreResponse.ok) {
                        const result = await firestoreResponse.json();
                        return {
                            statusCode: 200,
                            headers: CORS_HEADERS,
                            body: JSON.stringify({ success: true, message: "Dream saved.", documentName: result.name })
                        };
                    }
                    break;

                case 'LOAD_DREAMS':
                    // **SECURITY FIX:** Use a Structured Query to enforce filtering by userId.
                    const structuredQuery = {
                        select: { fields: [{ fieldPath: "*" }] },
                        from: [{ collectionId: "dreams" }],
                        where: {
                            fieldFilter: {
                                field: { fieldPath: "userId" },
                                op: "EQUAL",
                                value: { stringValue: userId }
                            }
                        },
                        orderBy: [{
                            field: { fieldPath: "timestamp" },
                            direction: "DESCENDING"
                        }]
                    };

                    firestoreResponse = await fetch(FIRESTORE_QUERY_URL, {
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

                        return {
                            statusCode: 200,
                            headers: CORS_HEADERS,
                            body: JSON.stringify({ dreams })
                        };
                    }
                    break;

                case 'DELETE_DREAM':
                    if (!data || !data.dreamId) {
                        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: "Missing dreamId for deletion." }) };
                    }

                    const dreamDocumentPath = `users/${userId}/dreams/${data.dreamId}`;

                    firestoreResponse = await fetch(`${FIRESTORE_BASE_URL}${dreamDocumentPath}?key=${FIRESTORE_KEY}`, {
                        method: 'DELETE'
                    });

                    if (firestoreResponse.ok) {
                        return {
                            statusCode: 200,
                            headers: CORS_HEADERS,
                            body: JSON.stringify({ success: true, message: `Dream ${data.dreamId} deleted.` })
                        };
                    }
                    break;

                default:
                    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: "Invalid data action." }) };
            }

            // Handle generic Firestore errors
            const errorText = firestoreResponse ? await firestoreResponse.text() : 'Unknown database error';
            console.error("Firestore operation failed:", firestoreResponse?.status, errorText);
            return {
                statusCode: firestoreResponse?.status || 500,
                headers: CORS_HEADERS,
                body: JSON.stringify({ message: "Database operation failed. Check console for details.", details: errorText })
            };

        }


        // ------------------------------------------------------------------
        // SECTION 2: GOOGLE AI GENERATION FEATURES (UN-GATED)
        // ------------------------------------------------------------------

        // --- 2a. Handle Image Generation (Imagen) ---
        if (feature === 'image_generation') {
            if (!imagePrompt) {
                return {
                    statusCode: 400,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ message: 'Missing "imagePrompt" data for image generation.' })
                };
            }

            const IMAGEN_MODEL = "imagen-3.0-generate-002";
            const IMAGEN_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGEN_MODEL}:predict?key=${GEMINI_API_KEY}`;

            const imagenPayload = {
                instances: [{ prompt: imagePrompt }],
                parameters: {
                    sampleCount: 1,
                    aspectRatio: "1:1",
                    outputMimeType: "image/png"
                }
            };

            // FIX: Use fetchWithRetry for reliability
            const response = await fetchWithRetry(IMAGEN_API_URL, { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(imagenPayload)
            });

            if (!response.ok) {
                const errorBody = await response.text();
                console.error("Imagen API Error:", response.status, errorBody);
                throw new Error(`Imagen API failed with status ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            const base64Data = result?.predictions?.[0]?.bytesBase64Encoded;

            if (!base64Data) {
                console.error("Imagen API Response Missing Data:", JSON.stringify(result));
                throw new Error("Imagen API response did not contain image data.");
            }

            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({
                    imageUrl: `data:image/png;base64,${base64Data}`,
                    altText: `Generated vision for: ${imagePrompt}`
                })
            };
        }

        // --- 2b. Handle TTS Generation (Gemini TTS) ---
        if (feature === 'tts') {
            if (!textToSpeak) {
                return {
                    statusCode: 400,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ message: 'Missing required text data for TTS.' })
                };
            }

            const TTS_MODEL = "gemini-2.5-flash-preview-tts";
            const TTS_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

            const ttsPayload = {
                contents: [{ parts: [{ text: textToSpeak }] }],
                generationConfig: {
                    responseModalities: ["AUDIO"],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: {
                                voiceName: "Puck"
                            }
                        }
                    }
                },
                model: TTS_MODEL
            };

            // FIX: Uses correct TTS_API_URL and fetchWithRetry
            const response = await fetchWithRetry(TTS_API_URL, { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(ttsPayload)
            });

            if (!response.ok) {
                const errorBody = await response.text();
                console.error("TTS API Error:", response.status, errorBody);
                throw new Error(`TTS API failed with status ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            const part = result?.candidates?.[0]?.content?.parts?.find(
                p => p.inlineData && p.inlineData.mimeType.startsWith('audio/')
            );

            const audioData = part?.inlineData?.data;
            const mimeType = part?.inlineData?.mimeType;

            if (!audioData || !mimeType) {
                console.error("TTS API Response Missing Audio Data:", JSON.stringify(result));
                throw new Error("TTS API response did not contain audio data.");
            }

            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({
                    audioData: audioData,
                    mimeType: mimeType
                })
            };
        }

        // --- 2c. Handle Text Generation ---
        if (TEXT_GENERATION_FEATURES.includes(feature)) {
            if (!userGoal) {
                return {
                    statusCode: 400,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ message: 'Missing required userGoal data for feature.' })
                };
            }

            // Using the standard alias for the Pro model
            const TEXT_MODEL = "gemini-2.5-pro";
            const TEXT_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

            const systemInstructionText = SYSTEM_INSTRUCTIONS[feature];

            // 1. Define the base content and generation config
            const payload = {
                contents: [{ parts: [{ text: userGoal }] }],
                generationConfig: {
                    // Set temperature low for structured output, slightly higher for creative text
                    temperature: feature === 'smart_goal_structuring' ? 0.2 : 0.7, 
                }
            };
            
            // 2. Add System Instruction ONLY for non-SMART goal features
            if (feature !== 'smart_goal_structuring') {
                payload.systemInstruction = {
                    parts: [{ text: systemInstructionText }]
                };
            }

            // 3. Add Structured Output configuration ONLY for SMART goal feature
            if (feature === 'smart_goal_structuring') {
                payload.generationConfig.responseMimeType = "application/json";
                payload.generationConfig.responseSchema = SMART_GOAL_SCHEMA;
            } 

            // FIX: Use fetchWithRetry for reliability
            const response = await fetchWithRetry(TEXT_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorBody = await response.text();
                console.error("Text Generation API Error:", response.status, errorBody);
                throw new Error(`Text Generation API failed with status ${response.status}: ${errorBody}`);
            }

            const result = await response.json();

            // --- Handle Structured JSON Output (SMART Goal) ---
            if (feature === 'smart_goal_structuring') {
                const candidate = result.candidates?.[0]?.content?.parts?.[0];
                let structuredData = null;

                if (candidate?.data) {
                    structuredData = candidate.data;
                } else if (candidate?.text) {
                    const rawText = candidate.text.trim();
                    try {
                        const jsonString = rawText.startsWith('```') ? rawText.slice(rawText.indexOf('{')).replace(/```\s*$/, '') : rawText;
                        structuredData = JSON.parse(jsonString);
                    } catch (e) {
                        console.error("JSON Parsing Fallback Failed:", e);
                    }
                }

                if (!structuredData) {
                    console.error("Text Generation API Response Missing or Invalid JSON Data:", JSON.stringify(result));
                    throw new Error("SMART Goal generation failed: response did not contain structured JSON data.");
                }
                
                return {
                    statusCode: 200,
                    headers: CORS_HEADERS,
                    body: JSON.stringify(structuredData) 
                };
            }

            // --- Handle standard text output (for all other features) ---
            const fullText = result.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!fullText) {
                console.error("Text Generation API Response Missing Text:", JSON.stringify(result));
                throw new Error("Text Generation API response did not contain generated text.");
            }

            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({ text: fullText })
            };
        }

        // --- Default Case ---
        return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: `Invalid "action/feature" specified: ${feature}. Must be one of: ${[...DATA_OPERATIONS, 'image_generation', 'tts', ...TEXT_GENERATION_FEATURES].join(', ')}` })
        };

    } catch (error) {
        console.error("Internal server error:", error);
        return {
            statusCode: 500,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: `Internal server error: ${error.message}` })
        };
    }
};
