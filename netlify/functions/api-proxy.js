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

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json' };

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
    // DEVELOPMENT BYPASS
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

        const generateImage = async (imagePrompt, GEMINI_API_KEY) => {
    if (!imagePrompt) {
        throw new Error('Missing "imagePrompt" for image generation.');
    }

    // --- FIX 1: Correct Model and generateContent Endpoint ---
    const IMAGEN_MODEL = "gemini-2.5-flash-image";
    const IMAGEN_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGEN_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    
    // --- FIX 2: Correct Payload Structure for generateContent (Minimal Working Version) ---
    // The prompt must be sent in a 'contents' array.
    const geminiImagePayload = {
        contents: [
            { 
                // The role is optional for the first prompt, but good practice
                role: "user", 
                parts: [{ text: imagePrompt }] 
            }
        ],
        // The old 'config' and 'prompt' fields that caused the 400 error are removed.
        // We will test with minimal payload first.
    };

    const response = await fetch(IMAGEN_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiImagePayload) // Use the new payload
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error("Gemini API Error:", response.status, errorBody);
        throw new Error(`Gemini API failed with status ${response.status}: ${response.statusText}. Error body: ${errorBody}`);
    }

    const result = await response.json();
    
    // --- FIX 3: Correct Response Parsing for generateContent ---
    // The image data is now nested deeper under candidates/content/parts/inlineData/data
    const base64Data = result?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!base64Data) {
        // If no image is returned, the model might have returned text instead.
        const textResponse = result?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (textResponse) {
             console.warn("Gemini Image API returned text instead of image:", textResponse);
             throw new Error(`Gemini Image API did not return an image. Model response: ${textResponse.substring(0, 100)}...`);
        }
        console.error("Gemini Image Response Missing Data:", JSON.stringify(result));
        throw new Error("Gemini Image API response did not contain image data.");
    }

    return `data:image/png;base64,${base64Data}`;
};
// --- NEW 2a. Handle Image Generation (Redirect to Helper) ---
// This handles the original standalone 'image_generation' feature.
if (feature === 'image_generation') {
    try {
        const imageUrl = await generateImage(imagePrompt, GEMINI_API_KEY);
        
        return {
            statusCode: 200,
            headers: CORS_HEADERS,
            body: JSON.stringify({
                imageUrl: imageUrl,
                altText: `Generated vision for: ${imagePrompt}`
            })
        };
    } catch (error) {
        return {
            statusCode: 500,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: error.message })
        };
    }
}

        // --- 2b. Handle TTS Generation (Gemini TTS) ---
    else if (feature === 'tts') {
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
    }

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

// Add this block near your other feature handlers (e.g., 'tts', 'image_generation')
else if (feature === 'prime_directive') {
    // 1. Input Validation (Ensure data sent from frontend is present)
    const userGoal = body.userGoal; // Assumes you pass this from the frontend
    const emotionalFocus = body.emotionalFocus; // Assumes you pass this from the frontend

    if (!userGoal || !emotionalFocus) {
        return { 
            statusCode: 400, 
            headers: CORS_HEADERS, 
            body: JSON.stringify({ message: 'Missing required goal or emotionalFocus data for Prime Directive.' }) 
        };
    }
    
    // 2. Define Assertive System Prompt
    const PRIME_DIRECTIVE_INSTRUCTION = `
You are a highly assertive, professional, and masculine executive coach. Your role is to deliver a direct, no-nonsense command and a hyper-specific, sensory-focused visual prompt.

1. ASSERTIVE VOICE: Adopt a commanding, professional male tone.
2. SENSORY FOCUS: Your IMAGE_PROMPT must focus purely on the visceral, positive *SENSORY FEELING* that directly COUNTERS the user's Emotional Anchor. (E.g., if the anchor is 'Fear of Regret,' the prompt must describe the feeling of 'Profound Relief' or 'Unstoppable Momentum' in vivid detail.)
3. COMMAND TEXT: The COMMAND_TEXT must be under 30 words, reference scarcity (time, opportunity, etc.), and demand immediate, specific action.
4. OUTPUT FORMAT: Respond ONLY with a valid JSON object matching the required schema.

Schema:
{
  "image_prompt": "string: Detailed sensory description countering the fear.",
  "command_text": "string: Assertive, scarcity-based command."
}
    `;

   // 3. Prepare Payload (STANDARD GEMINI REST API STRUCTURE)
const TEXT_MODEL = "gemini-2.5-flash"; 
const TEXT_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    
const userPrompt = `GOAL: ${userGoal}. EMOTIONAL ANCHOR (Fear to counter): ${emotionalFocus}. Generate the required JSON output.`;

const payload = {
    // 1. User content
    contents: [{ parts: [{ text: userPrompt }] }],
    
    // 2. System Instruction MUST be an object with 'parts' to match the working 'plan' feature
    systemInstruction: { parts: [{ text: PRIME_DIRECTIVE_INSTRUCTION }] },
    
    // 3. Generation configuration (keep this structure for structured output)
    generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json" // Crucial for getting JSON output
    }
};

    // 4. Call Gemini API
    const response = await retryFetch(TEXT_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error("Prime Directive API Error:", response.status, errorBody);
        throw new Error(`Prime Directive API failed.`);
    }

    const result = await response.json();
    const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;

    // 5. Parse and Process Structured Data
    try {
        const parsedContent = JSON.parse(rawText);
        const imagePrompt = parsedContent.image_prompt;
        const commandText = parsedContent.command_text;

        let imageUrl = '';
        
        // **FIX: Synchronously generate the image before returning**
        if (imagePrompt) {
            try {
                imageUrl = await generateImage(imagePrompt, GEMINI_API_KEY);
            } catch (e) {
                console.warn("Prime Directive Image Generation Failed (Continuing with text):", e.message);
                // The main handler will still return the text, just without an image.
            }
        }

        return {
            statusCode: 200,
            headers: CORS_HEADERS,
            body: JSON.stringify({
                imagePrompt: imagePrompt,
                commandText: commandText,
                imageUrl: imageUrl // <--- CRITICAL FIX: Include the final image URL
            })
        };
    } catch (e) {
        console.error("Failed to parse Prime Directive JSON output:", rawText, e);
        return {
            statusCode: 500,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: "AI response failed to provide valid JSON for Prime Directive." })
        };
    }
}
        // --- 2c. Handle BARRIER BREAKER (Gemini Flash - Structured JSON) ---
        else if (feature === 'BREAK_BARRIER' || feature === 'dream_energy_analysis') {
            const userGoal = body.userGoal;
            const emotionalFocus = body.emotionalFocus || ''; // Optional

            if (!userGoal) {
                return {
                    statusCode: 400,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ message: 'Missing required userGoal data for Barrier Breaker.' })
                };
            }

            const BARRIER_BREAKER_INSTRUCTION = `
You are the **Ultimate AI Executive Coach**, delivering uncompromising, analytical, and highly actionable guidance. Your output is used for both deep "Dream Energy" analysis and "Barrier Breaker" action planning.

**STRICT MANDATES FOR DEPTH AND LENGTH:**
1.  **LENGTH:** Every major descriptive field MUST be substantial. 'emotionalCounterStrategy' MUST be at least **100 words (minimum 6 sentences)**. 'summaryInsight' MUST be at least **3 sentences**.
2.  **FORMATTING:** You MUST use strong Markdown formatting (bolding, internal lists) within the string values for 'emotionalCounterStrategy' and 'threeStepActionTrek' to ensure maximum scannability and structure.
3.  **TONE:** Highly assertive, professional, and directly focused on actionable guidance and overcoming psychological obstacles.

**OUTPUT SCHEMA REQUIREMENTS:**

1. INTERNAL CONFLICT: Identify the single most paralyzing psychological tension blocking the GOAL (e.g., Ambition vs. Safety).
2. EXTERNAL PRESCRIPTION: Identify the single most effective external resource (skill, person, or tool) required to neutralize the specific internal conflict.
3. SUMMARY INSIGHT: A powerful, minimum **three-sentence** analytical statement connecting the internal conflict to the prescribed external resource.
4. EMOTIONAL COUNTER-STRATEGY: A detailed, coaching paragraph (minimum 100 words / 6 sentences). Explain how the user can acknowledge the emotional anchor and mentally reframe it into unstoppable momentum. **Structure the paragraph using Markdown for clarity.**
5. THREE-STEP ACTION TREK: Provide exactly 3 sequential, concrete, immediate action steps. Each step MUST be a separate, concise Markdown bullet point string.

User's Goal: "\${userGoal}"
\${emotionalFocus ? \`Emotional Anchor (for added depth): "\${emotionalFocus}"\` : ''}

Respond ONLY with a valid JSON object matching the required schema. DO NOT include ANY commentary or text outside the JSON object.

Schema:
{
    "internalConflict": "string: The diagnosed psychological tension.",
    "externalPrescription": "string: The recommended external resource/action.",
    "summaryInsight": "string: Powerful, three-sentence minimum summary.",
    "emotionalCounterStrategy": "string: Detailed, multi-sentence (100-word minimum) paragraph using internal Markdown.",
    "threeStepActionTrek": [
        "string: Markdown bullet point for Step 1.",
        "string: Markdown bullet point for Step 2.",
        "string: Markdown bullet point for Step 3."
    ]
}
`;
            const TEXT_MODEL = "gemini-2.5-flash";
            const TEXT_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

            const userPrompt = `Generate the Barrier Breaker analysis based on the Goal and Emotional Anchor.`;

            const payload = {
                contents: [{ parts: [{ text: userPrompt }] }],
                systemInstruction: { parts: [{ text: BARRIER_BREAKER_INSTRUCTION }] },
                generationConfig: {
                    temperature: 0.7,
                    responseMimeType: "application/json"
                }
            };

            const response = await retryFetch(TEXT_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorBody = await response.text();
                console.error("Barrier Breaker API Error:", response.status, errorBody);
                throw new Error(`Barrier Breaker API failed.`);
            }

            const result = await response.json();
            const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;

            try {
                const parsedContent = JSON.parse(rawText);

                // Ensure the required keys are present before returning
                if (!parsedContent.internalConflict || !parsedContent.externalPrescription) {
                    throw new Error("Parsed JSON missing required Barrier Breaker fields.");
                }

                return {
                    statusCode: 200,
                    headers: CORS_HEADERS,
                    body: JSON.stringify(parsedContent) // Return the full object
                };
            } catch (e) {
                console.error("Failed to parse Barrier Breaker JSON output:", rawText);
                return {
                    statusCode: 500,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ message: "AI response failed to provide valid JSON for Barrier Breaker." })
                };
            }
        }
        
        // --- 2c. Handle Text Generation  ---
        else if (TEXT_GENERATION_FEATURES.includes(feature)) {
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
            let responseKey = 'text'; // Default to plain text response

            // Only attempt JSON parsing for specific structured output features
            if (feature === "plan" || feature === "smart_goal_structuring") {
                try {
                    parsedContent = JSON.parse(rawText);
                    responseKey = feature === "plan" ? 'plan' : 'smartGoal';
                } catch (jsonError) {
                    console.warn(`[RyGuyLabs] Feature ${feature} returned non-JSON. Sending raw text as fallback.`);
                    // Fallback: use rawText as the content if parsing fails
                    parsedContent = rawText;
                }
            }

            // Return normalized response for all features
            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({
                    [responseKey]: parsedContent || rawText
                })
            };
        }


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
