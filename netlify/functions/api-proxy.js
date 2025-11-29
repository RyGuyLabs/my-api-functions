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
    "smart_goal_structuring"
];

// Map feature types to system instructions
const SYSTEM_INSTRUCTIONS = {
  "plan": `
You are a world-class life coach named RyGuy. Your tone is supportive, encouraging, and highly actionable.
Create a step-by-step action plan with 10–12 major milestones to help the user achieve their goal.

Return your response STRICTLY in valid JSON format with this exact structure:
{
  "steps": [
    {
      "title": "Step title (short and actionable)",
      "details": "Detailed explanation of how to complete this step."
    }
  ]
}

Each 'title' should represent a clickable main task.
Each 'details' should be a clear, motivational paragraph expanding on what the user can do.
Do NOT include markdown, lists, or other formatting — return ONLY JSON.
`,

  "pep_talk": "You are a motivational speaker named RyGuy. Your tone is energetic, inspiring, and positive. Write a powerful pep talk to help the user achieve their goal in **300 characters or less**. Use extremely concise, uplifting language. Separate sentences naturally, avoid quotes, symbols, or code formatting, and deliver the output as raw text.",

  "obstacle_analysis": "You are a strategic consultant named RyGuy. Your tone is analytical and practical. Identify up to three potential obstacles the user might face and provide a paragraph for each with practical strategies to overcome them. Separate each obstacle paragraph with a blank line. Avoid lists, symbols, quotes, or code formatting. Deliver as raw text.",

  "positive_spin": "You are an optimistic reframer named RyGuy. Your tone is positive and encouraging. Take the user's negative statement and rewrite it in a single paragraph that highlights opportunities and strengths. Avoid quotes, symbols, or code formatting. Deliver as raw text.",

  "mindset_reset": "You are a pragmatic mindset coach named RyGuy. Your tone is direct and actionable. Provide a brief, practical mindset reset in one paragraph. Focus on shifting perspective from a problem to a solution. Avoid lists, symbols, quotes, or code formatting. Deliver as raw text.",

  "objection_handler": "You are a professional sales trainer named RyGuy. Your tone is confident and strategic. Respond to a sales objection in a single paragraph that first acknowledges the objection and then provides a concise, effective strategy to address it. Avoid lists, symbols, quotes, or code formatting. Deliver as raw text.",

  // --- REVISED: Updated content to R.E.A.D.Y. framework ---
  "smart_goal_structuring": `
You are a holistic goal-setting specialist named RyGuy. Help the user transform their dream into a clear, inspiring roadmap using the powerful R.E.A.D.Y. framework—a belief-to-achievement system built on commitment, action, and continuous optimization.

Each letter represents a phase of momentum:
R — Reflect → Engage with your desired outcome and build deep commitment.
E — Execute → Commit to the plan and take the first concrete action step (the "Trek").
A — Assess → Analyze your progress using milestones and receive custom insight reports.
D — Dial In → Check key performance data (like the DEI score) to inform strategy correction.
Y — Yield → Receive your immediate emotional feedback and motivation (the "Pep Talk").

🧭 Theme progression: Commitment → Action → Review → Correction → Sustain.

Return a directly usable JSON object with exactly five main keys: R, E, A, D, and Y.
Each key must contain:
- "title" (e.g., "Reflect")
- "description" (a vivid, supportive explanation based on the letter's function)
- "theme" (Commitment, Action, Review, Correction, or Sustain)
- "motivation" (an encouraging one-liner that energizes the user)
- "exampleAction" (a realistic example or next-step instruction)
- "aiGuidance" (A **unique, strategic piece of guidance** for this specific step, written in a professional, coaching tone.)
- "aiTip" (A **unique, actionable, short tip** designed to get the user immediate results for this specific action step.)

Ensure the content of "aiGuidance" and "aiTip" is **distinct and highly tailored** to the user's main goal.

Return only valid JSON — no markdown, quotes, or commentary.
`
};

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
};

// --- API FETCH HELPER WITH EXPONENTIAL BACKOFF (Max 3 Retries) ---

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * Executes a fetch request with exponential backoff for temporary errors (429, 5xx).
 * @param {string} url - The URL to fetch.
 * @param {object} options - Fetch options (method, headers, body, etc.).
 * @param {number} [maxRetries=MAX_RETRIES] - Maximum number of retries.
 * @returns {Promise<Response>} The successful response object.
 * @throws {Error} If all retries fail.
 */
async function retryFetch(url, options, maxRetries = MAX_RETRIES) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(url, options);

            // Check for retryable errors (Too Many Requests or Server Errors)
            if (response.status === 429 || response.status >= 500) {
                if (i === maxRetries - 1) {
                    throw new Error(`Fetch failed after ${maxRetries} retries with status ${response.status}.`);
                }

                const delay = RETRY_DELAY_MS * Math.pow(2, i);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue; // retry loop
            }
            return response; // Success or non-retryable client error (e.g., 400, 401)
        } catch (error) {
            // Catch network errors (e.g., DNS failure, timeout)
            if (i === maxRetries - 1) throw error; // Re-throw after max retries
            const delay = RETRY_DELAY_MS * Math.pow(2, i);
            await new Promise(resolve => setTimeout(resolve, delay));
            // Do not log retry as an error in the console.
        }
    }
    // Should be unreachable if maxRetries > 0
    throw new Error("Fetch failed without a retryable status or network error.");
}


// --- FIRESTORE REST API HELPERS ---

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

// Function to handle the Imagen API call
async function generateImagenData(prompt, apiKey) { // ⬅️ NEW ARGUMENT
    if (!prompt) {
        throw new Error('Image prompt required for Imagen API call.');
    }

    const IMAGEN_MODEL = "imagen-2.0-generate-002";
    // Use the passed-in apiKey instead of the global GEMINI_API_KEY
    const IMAGEN_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGEN_MODEL}:generateImages?key=${apiKey}`; // ⬅️ USED NEW ARGUMENT
    const imagenPayload = {
        model: IMAGEN_MODEL,
        prompt: prompt, // Use the passed prompt
        config: {
            numberOfImages: 1,
            outputMimeType: "image/png",
            aspectRatio: "1:1"
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
    const base64Data = result?.generatedImages?.[0]?.image?.imageBytes;

    if (!base64Data) {
        console.error("Imagen API Response Missing Data:", JSON.stringify(result));
        throw new Error("Imagen API response did not contain image data.");
    }
    
    // 💡 RETURN ONLY THE DATA URI, NOT THE FULL HTTP RESPONSE
    return {
        imageUrl: `data:image/png;base64,${base64Data}`,
        altText: `Generated vision for: ${prompt}`
    };
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
        const response = await retryFetch(squarespaceApiUrl, {
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


exports.handler = async (event, context) => {
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
        const { action, userId, data, userGoal, textToSpeak, imagePrompt } = body;

        const feature = action || body.feature;

        if (!feature) {
             return {
                 statusCode: 400,
                 headers: CORS_HEADERS,
                 body: JSON.stringify({ message: "Missing required 'action' parameter." })
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

                    // **FIX:** Add a timestamp for correct ordering in LOAD_DREAMS
                    const dataWithTimestamp = { ...data, timestamp: new Date().toISOString() };

                    // Convert raw JS object into Firestore REST API format
                    const firestoreFields = jsToFirestoreRest(dataWithTimestamp).mapValue.fields;

                    // POST to the collection path will create a new document with an auto-generated ID
                    firestoreResponse = await retryFetch(`${FIRESTORE_BASE_URL}${userDreamsCollectionPath}?key=${FIRESTORE_KEY}`, {
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
                    // Use a Structured Query on the user's subcollection.
                    const structuredQuery = {
                        // Select all fields
                        select: { fields: [{ fieldPath: "*" }] },
                        from: [{ collectionId: "dreams" }], // Target the 'dreams' subcollection
                        // **FIX:** Removed redundant 'where' clause, as scope is enforced by the 'parent' path
                        orderBy: [{
                            field: { fieldPath: "timestamp" },
                            direction: "DESCENDING"
                        }]
                    };

                    firestoreResponse = await retryFetch(FIRESTORE_QUERY_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        // Parent is the user document, which limits the query to the user's data
                        body: JSON.stringify({ parent: `projects/${PROJECT_ID}/databases/(default)/documents/users/${userId}`, structuredQuery: structuredQuery })
                    });

                    if (firestoreResponse.ok) {
                        const result = await firestoreResponse.json();

                        // The result is an array of query results, each containing a 'document'
                        const dreams = (result || [])
                            .filter(item => item.document) // Filter out any empty results
                            .map(item => {
                                const doc = item.document;
                                // Extract the document ID from the full resource name
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

                    firestoreResponse = await retryFetch(`${FIRESTORE_BASE_URL}${dreamDocumentPath}?key=${FIRESTORE_KEY}`, {
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
                    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: "Invalid data action." }) };
            }

            // Handle generic Firestore errors if response was not ok
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

            const IMAGEN_MODEL = "imagen-2.0-generate-002"; 
            const IMAGEN_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGEN_MODEL}:generateImages?key=${GEMINI_API_KEY}`;            
            const imagenPayload = {
    model: IMAGEN_MODEL, 
    prompt: imagePrompt, 
    config: {
        numberOfImages: 1,
        outputMimeType: "image/png",
        aspectRatio: "1:1"
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
            const base64Data = result?.generatedImages?.[0]?.image?.imageBytes;

            if (!base64Data) {
                console.error("Imagen API Response Missing Data:", JSON.stringify(result));
                throw new Error("Imagen API response did not contain image data.");
            }

            return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify({
        commandText: geminiCommand,
        imagePrompt: geminiAnchor,
        imageUrl: `data:image/png;base64,${base64Data}`, // <-- Imagen result added here
        altText: `Generated vision for: ${geminiAnchor}`
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
                    prebuiltVoiceConfig: { voiceName: "Achird" }
                }
            }
        }
    }; // <--- THIS SEMICOLON CLOSES THE TTS PAYLOAD

    const response = await retryFetch(TTS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ttsPayload),
        signal: AbortSignal.timeout(60000)
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

// Inside exports.handler, where you check the 'feature' variable:
        
        // --- 2c. Handle Text Generation (Gemini Flash) ---
        if (TEXT_GENERATION_FEATURES.includes(feature)) {
            if (!userGoal) {
                return {
                    statusCode: 400,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ message: 'Missing required userGoal data for feature.' })
                };
            }

            const TEXT_MODEL = "gemini-2.5-flash";
            const TEXT_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

            const systemInstructionText = SYSTEM_INSTRUCTIONS[feature];

            const payload = {
                contents: [{ parts: [{ text: userGoal }] }],
                systemInstruction: { parts: [{ text: systemInstructionText }] },
            };

            const response = await retryFetch(TEXT_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorBody = await response.text();
                console.error("Text Generation API Error:", response.status, errorBody);
                throw new Error(`Text Generation API failed with status ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!rawText) {
                console.error("Text Generation API Response Missing Text:", JSON.stringify(result));
                throw new Error("Text Generation API response did not contain generated text.");
            }

            let parsedContent = null;
            let responseKey = 'text'; 
            
            const cleanedText = rawText
                .replace(/```json\s*|```/g, '') // Remove Markdown code block delimiters
                .trim();
            
            // 2. Only attempt JSON parsing for structured output features (NOW INCLUDING prime_directive)
            if (feature === "plan" || feature === "smart_goal_structuring" || feature === "prime_directive") {
                try {
                    const content = JSON.parse(cleanedText); // ⬅️ PARSE THE CLEANED TEXT
                    parsedContent = content; 
                    
                    // Set the response key based on the feature
                    responseKey = feature === "plan" ? 'plan' : 
                                    (feature === "prime_directive" ? 'primeDirective' : 'smartGoal');

                    // ⬇️ 3. IMAGE CHAINING LOGIC (Only for Prime Directive) ⬇️
                    if (feature === 'prime_directive' && parsedContent.image_prompt) {
                        console.log(`[PRIME_DIR] Starting image generation for prompt: ${parsedContent.image_prompt.substring(0, 50)}...`);
                        
                        // Call the globally available helper function
                        const imagenData = await generateImagenData(parsedContent.image_prompt, GEMINI_API_KEY);
                        
                        // Inject the image data into the final JSON response object
                        parsedContent.imageUrl = imagenData.imageUrl;
                        parsedContent.altText = imagenData.altText;
                        console.log(`[PRIME_DIR] Image generation successful.`);
                    }
                    // ⬆️ END IMAGE CHAINING ⬆️

                } catch (jsonError) {
                    // This handles the original "AI response failed to provide valid JSON" error
                    console.error(`[RyGuyLabs] Failed to parse JSON for feature ${feature}. Raw text: ${rawText.substring(0, 200)}...`, jsonError);
                    throw new Error("AI response failed to provide valid JSON for a structured feature."); 
                }
            } else {
                 // For all other non-JSON text features (pep_talk, etc.)
                 parsedContent = rawText;
            }

            // Return normalized response for all features
            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({
                    [responseKey]: parsedContent || rawText
                })
            };
        // --- Default Case ---
        return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: `Invalid "action/feature" specified: ${feature}` })
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
