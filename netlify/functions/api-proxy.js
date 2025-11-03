
/**
 * Netlify Function: secure-data-proxy
 * * This function serves as the single secure gateway for ALL features (AI & Data).
 * * It handles:
 * 1. AUTHORIZATION: Checks for an active subscription status via Squarespace.
 * 2. DATA ACCESS: Interacts with the secure Firestore database (REST API) using structured queries.
 * 3. AI GENERATION: Text (Gemini), Image (Imagen), and TTS (Gemini/Cloud TTS).
 * * * Environment Variables required:
 * - FIRST_API_KEY (Your existing key): Used for all Google AI calls (Gemini/Imagen/TTS).
 * - SQUARESPACE_ACCESS_TOKEN (NEW): Token to query Squarespace for membership status.
 * - DATA_API_KEY (NEW): Google API Key for Firestore REST API access.
 * - FIRESTORE_PROJECT_ID (NEW): The ID of the Firebase project.
 */

// **CRITICAL FIX for Netlify/Lambda:** Use .default for robust node-fetch import
const fetch = require('node-fetch').default || require('node-fetch');

// --- GLOBAL SETUP FOR DATA & SECURITY ---
const SQUARESPACE_TOKEN = process.env.SQUARESPACE_ACCESS_TOKEN;
const FIRESTORE_KEY = process.env.DATA_API_KEY;
const PROJECT_ID = process.env.FIRESTORE_PROJECT_ID;
const GEMINI_API_KEY = process.env.FIRST_API_KEY;

// Base URL for the Firestore REST API (Used for document-specific operations like POST/DELETE)
const FIRESTORE_BASE_URL =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/`;

// Base URL for Firestore queries (Used for secure, filtered reads/writes)
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
    "plan", "pep_talk", "vision_prompt", "obstacle_analysis",
    "positive_spin", "mindset_reset", "objection_handler",
    "smart_goal_structuring",
    "dream_energy_analysis" // <-- FIX: Added missing feature
];

// Map feature types to system instructions
const SYSTEM_INSTRUCTIONS = {
    "plan": "You are an expert project manager and motivator. Create a comprehensive, step-by-step action plan to achieve the user's dream. The plan must contain a brief, motivating introduction and a numbered list (ordered list in Markdown) of at least 10 concrete, initial steps or milestones. Deliver the output as clean, raw text suitable for direct display.",
    "pep_talk": "You are RyGuy, a masculine, inspiring, and enthusiastic life coach. Generate an encouraging, short pep talk (about 120 words or less) to motivate the user to start their dream. The tone must be exciting, positive, and direct. The content should be suitable for Text-to-Speech narration. Separate sentences naturally, avoid quotes, symbols, or code formatting, and deliver the output as raw text.",
    "vision_prompt": "You are a creative visual artist. Based on the user's dream, write a detailed, high-quality, cinematic image generation prompt (max 100 words) suitable for an AI image model like Imagen. The image should be a dramatic, aspirational, and highly detailed visual representation of the dream achieved. Write a prompt to generate a visual representation of this dream's successful completion. Avoid quotes, symbols, or code formatting. Deliver as raw text.",
    "obstacle_analysis": "You are a strategic consultant named RyGuy. Your tone is analytical and practical. Identify up to three potential obstacles the user might face and provide a paragraph for each with practical strategies to overcome them. Separate each obstacle paragraph with a blank line. Avoid lists, symbols, quotes, or code formatting. Deliver as raw text.",
    "positive_spin": "You are an optimistic reframer named RyGuy. Your tone is positive and encouraging. Take the user's negative statement and rewrite it in a single paragraph that highlights opportunities and strengths. Avoid quotes, symbols, or code formatting. Deliver as raw text.",
    "mindset_reset": "You are a pragmatic mindset coach named RyGuy. Your tone is direct and actionable. Provide a brief, practical mindset reset in one paragraph. Focus on shifting perspective from a problem to a solution. Avoid lists, symbols, quotes, or code formatting. Deliver as raw text.",
    "objection_handler": "You are a professional sales trainer named RyGuy. Your tone is confident and strategic. Respond to a sales objection in a single paragraph that first acknowledges the objection and then provides a concise, effective strategy to address it. Avoid lists, symbols, quotes, or code formatting. Deliver as raw text.",
"smart_goal_structuring": "You are a professional goal-setting consultant. Take the user's dream and convert it into a well-structured, inspiring S.M.A.R.T. goal. Focus entirely on converting the dream into the required, structured goal components.",};

// --- NEW: Schema for Structured Output (S.M.A.R.T. Goal) ---
const SMART_GOAL_SCHEMA = {
    type: "object",
    properties: {
        goalTitle: {
            type: "string",
            description: "A concise, inspiring title for the S.M.A.R.T. goal."
        },
        specific: {
            type: "string",
            description: "A statement explaining what exactly will be accomplished."
        },
        measurable: {
            type: "string",
            description: "A statement defining the metrics used to track progress."
        },
        achievable: {
            type: "string",
            description: "A statement confirming the necessary skills, resources, and realism of the goal."
        },
        relevant: {
            type: "string",
            description: "A statement explaining why this goal is important and how it aligns with the user's dream."
        },
        timeBound: {
            type: "string",
            description: "A statement defining the specific deadline for goal completion."
        }
    },
    required: ["goalTitle", "specific", "measurable", "achievable", "relevant", "timeBound"]
};
// -------------------------------------------------------------

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
};

// --- FIRESTORE REST API HELPERS (functions remain the same) ---
// ... (jsToFirestoreRest and firestoreRestToJs functions are unchanged) ...

/**
 * Converts a standard JavaScript object into the verbose Firestore REST API format.
 */
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

/**
 * Recursively unwraps the verbose Firestore REST API field object
 * into a standard JavaScript object.
 */
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


/**
 * [CRITICAL SECURITY GATE]
 * Checks the user's active membership status via the Squarespace API.
 * Includes a bypass for testing.
 * @param {string} userId - The unique user ID (from localStorage).
 * @returns {Promise<boolean>} True if the user has an active subscription, false otherwise.
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
    // REPLACE the URL below with the actual Squarespace API endpoint (e.g., /1.0/profiles or /1.0/orders)
    // that can verify membership for the user's ID/Email.
    const squarespaceApiUrl = `https://api.squarespace.com/1.0/profiles/check-membership/${userId}`;

    try {
        const response = await fetch(squarespaceApiUrl, {
            method: 'GET',
            headers: {
                // Squarespace uses a specific header format for API Keys
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
        // Adjust this line to match the JSON structure (e.g., data.orders[0].status === 'PAID')
        const isActive = data?.membershipStatus === 'ACTIVE' || data?.subscription?.status === 'ACTIVE';

        if (!isActive) {
            console.log(`User ${userId} is INACTIVE. Access denied.`);
        }

        return isActive;

    } catch (error) {
        console.error("Error checking Squarespace membership:", error);
        return false; // Deny access on failure
    }
}


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
        // FIX: Add 'operation' to destructuring as the preferred request parameter
        const { action, userId, data, userGoal, textToSpeak, imagePrompt, operation } = body;

        // FIX: Use 'operation' first, then fallback to existing 'action' or 'feature'
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

                    // Convert raw JS object into Firestore REST API format
                    const firestoreFields = jsToFirestoreRest(data).mapValue.fields;

                    // POST to the collection path will create a new document with an auto-generated ID
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
                        // Select all fields
                        select: { fields: [{ fieldPath: "*" }] },
                        from: [{ collectionId: "dreams" }],
                        where: {
                            fieldFilter: {
                                field: { fieldPath: "userId" },
                                op: "EQUAL",
                                value: { stringValue: userId }
                            }
                        },
                        // Order by timestamp
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

                        // The result is an array of query results, each containing a 'document'
                        const dreams = (result || [])
                            .filter(item => item.document) // Filter out any empty results
                            .map(item => {
                                const doc = item.document;
                                const docId = doc.name.split('/').pop();

                                // Convert Firestore fields back to clean JS object
                                const fields = firestoreRestToJs({ mapValue: { fields: doc.fields } });

                                // Return the required client-side object
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
                    // The client passes the document ID in data.dreamId
                    if (!data || !data.dreamId) {
                        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: "Missing dreamId for deletion." }) };
                    }

                    // Direct DELETE on the specific document path.
                    const dreamDocumentPath = `users/${userId}/dreams/${data.dreamId}`;

                    firestoreResponse = await fetch(`${FIRESTORE_BASE_URL}${dreamDocumentPath}?key=${FIRESTORE_KEY}`, {
                        method: 'DELETE'
                    });

                    if (firestoreResponse.ok) {
                        // Successful deletion returns 200 with an empty body
                        return {
                            statusCode: 200,
                            headers: CORS_HEADERS,
                            body: JSON.stringify({ success: true, message: `Dream ${data.dreamId} deleted.` })
                        };
                    }
                    break;

                default:
                    // Should be caught by the DATA_OPERATIONS check, but here for safety
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

            const response = await fetch(IMAGEN_API_URL, {
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

                // CRITICAL: Ensure speechConfig is correctly nested inside generationConfig
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

            const response = await fetch(TTS_API_URL, {
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

    // FIX: Use the standard alias for the Pro model
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
    
    // 2. Add System Instruction ONLY for non-SMART goal features (to avoid conflict with schema)
    if (feature !== 'smart_goal_structuring') {
        payload.systemInstruction = {
            parts: [{ text: systemInstructionText }]
        };
    }

    // 3. Add Structured Output configuration ONLY for SMART goal feature
    if (feature === 'smart_goal_structuring') {
        // Structured output must be directly inside generationConfig for REST API
        payload.generationConfig.responseMimeType = "application/json";
        payload.generationConfig.responseSchema = SMART_GOAL_SCHEMA;
    } 

    const response = await fetch(TEXT_API_URL, {
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

    // --- NEW: Handle Structured JSON Output (SMART Goal) ---
    if (feature === 'smart_goal_structuring') {
        // Structured output is found in the 'data' field of the part
        const jsonPart = result.candidates?.[0]?.content?.parts?.[0]?.data;

        if (!jsonPart) {
            console.error("Text Generation API Response Missing JSON Data:", JSON.stringify(result));
            throw new Error("SMART Goal generation failed: response did not contain structured JSON data.");
        }
        
        // Return the JSON object directly (the 'data' field is already parsed JSON)
        return {
            statusCode: 200,
            headers: CORS_HEADERS,
            body: JSON.stringify(jsonPart) // Send the structured data object
        };
    }

    // --- Existing: Handle standard text output (for all other features) ---
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
        // This will now catch requests using the old "generate_text" or any other invalid feature
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
