const fetch = require('node-fetch');

const SQUARESPACE_TOKEN = process.env.SQUARESPACE_ACCESS_TOKEN;
const FIRESTORE_KEY = process.env.DATA_API_KEY;
const PROJECT_ID = process.env.FIRESTORE_PROJECT_ID;
const GEMINI_API_KEY = process.env.FIRST_API_KEY;

const FIRESTORE_BASE_URL =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/`;

const FIRESTORE_QUERY_URL =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery?key=${FIRESTORE_KEY}`;

const DATA_OPERATIONS = [
    'SAVE_DREAM',
    'LOAD_DREAMS',
    'DELETE_DREAM'
];

const TEXT_GENERATION_FEATURES = [
    "plan", "pep_talk", "obstacle_analysis",
    "positive_spin", "mindset_reset", "objection_handler",
    "smart_goal_structuring"
];

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
    'Access-Control-Allow-Origin': 'https://www.ryguylabs.com',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Gemini-Model',
    'Content-Type': 'application/json'
};

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

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
    throw new Error("Fetch failed without a retryable status or network error.");
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

const generateImage = async (imagePrompt, GEMINI_API_KEY) => {
    if (!imagePrompt) {
        throw new Error('Missing "imagePrompt" for image generation.');
    }

    const IMAGEN_MODEL = "gemini-2.5-flash-image";
    const IMAGEN_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGEN_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    
    // The prompt must be sent in a 'contents' array.
    const geminiImagePayload = {
        contents: [
            { 
                // The role is optional for the first prompt, but good practice
                role: "user", 
                parts: [{ text: imagePrompt }] 
            }
        ],
        
    };

exports.handler = async (event, context) => {
    const CORS_HEADERS = {
        'Access-Control-Allow-Origin': 'https://www.ryguylabs.com',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Gemini-Model',
        'Access-Control-Max-Age': '86400'
    };

    if (event.httpMethod === 'OPTIONS') { // fixed capitalization and spelling
        return {
            statusCode: 204, 
            headers: CORS_HEADERS,  // Ensure CORS headers for OPTIONS response
            body: '' 
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: CORS_HEADERS,  // Ensure CORS headers for Method Not Allowed
            body: JSON.stringify({ message: "Method Not Allowed" })
        };
    }

    if (!GEMINI_API_KEY || GEMINI_API_KEY.trim() === '') {
        return {
            statusCode: 500,
            headers: CORS_HEADERS,  // Ensure CORS headers for internal error
            body: JSON.stringify({ message: 'AI API Key (FIRST_API_KEY) is not configured.' })
        };
    }

    if (!FIRESTORE_KEY || !PROJECT_ID) {
        return {
            statusCode: 500,
            headers: CORS_HEADERS,  // Ensure CORS headers for Firestore error
            body: JSON.stringify({ message: 'Firestore keys (DATA_API_KEY or FIRESTORE_PROJECT_ID) are missing. Cannot access database.' })
        };
    }

    try {
        const body = JSON.parse(event.body);
        const { action, userId, data, userGoal, textToSpeak, imagePrompt } = body;

        const feature = action || body.feature;

        if (feature === 'get_config') {
            return {
                statusCode: 200,
                headers: CORS_HEADERS,  // Ensure CORS headers for get_config response
                body: JSON.stringify({
                    apiKey: FIRESTORE_KEY,
                    authDomain: `${PROJECT_ID}.firebaseapp.com`,
                    projectId: PROJECT_ID,
                    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "",
                    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "",
                    appId: process.env.FIREBASE_APP_ID || ""
                })
            };
        }

        if (DATA_OPERATIONS.includes(feature.toUpperCase())) {
            if (!userId) {
                return {
                    statusCode: 401,
                    headers: CORS_HEADERS,  // Ensure CORS headers for Unauthorized error
                    body: JSON.stringify({ message: "Unauthorized: Missing userId for data access." })
                };
            }

            const userDreamsCollectionPath = `users/${userId}/dreams`;
            let firestoreResponse;

            switch (feature.toUpperCase()) {
                case 'SAVE_DREAM':
                    if (!data) { 
                        return { 
                            statusCode: 400, 
                            headers: CORS_HEADERS,  // Ensure CORS headers for missing data error
                            body: JSON.stringify({ message: "Missing data to save." }) 
                        }; 
                    }

                    const dataWithTimestamp = { ...data, timestamp: new Date().toISOString() };

                    const firestoreFields = jsToFirestoreRest(dataWithTimestamp).mapValue.fields;

                    firestoreResponse = await retryFetch(`${FIRESTORE_BASE_URL}${userDreamsCollectionPath}?key=${FIRESTORE_KEY}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ fields: firestoreFields })
                    });

                    if (firestoreResponse.ok) {
                        const result = await firestoreResponse.json();
                        return {
                            statusCode: 200,
                            headers: CORS_HEADERS,  // Ensure CORS headers for success response
                            body: JSON.stringify({ success: true, message: "Dream saved.", documentName: result.name })
                        };
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
                                try {
                                    const doc = item.document;
                                    const docId = doc.name.split('/').pop();

                                    const fields = firestoreRestToJs({ mapValue: { fields: doc.fields } });

                                    return { id: docId, ...fields };
                                } catch (err) {
                                    console.warn("Skipping invalid document in LOAD_DREAMS:", err);
                                    return null;
                                }
                            })
                            .filter(Boolean); // remove null entries from malformed documents

                        return {
                            statusCode: 200,
                            headers: CORS_HEADERS,  // Ensure CORS headers for success response
                            body: JSON.stringify({ dreams })
                        };
                    }
                    break;

                case 'DELETE_DREAM':
                    if (!data || !data.dreamId) {
                        return { 
                            statusCode: 400, 
                            headers: CORS_HEADERS,  // Ensure CORS headers for missing dreamId error
                            body: JSON.stringify({ message: "Missing dreamId for deletion." }) 
                        };
                    }

                    const dreamDocumentPath = `users/${userId}/dreams/${data.dreamId}`;

                    firestoreResponse = await retryFetch(`${FIRESTORE_BASE_URL}${dreamDocumentPath}?key=${FIRESTORE_KEY}`, {
                        method: 'DELETE'
                    });

                    if (firestoreResponse.status === 404) {
                        return {
                            statusCode: 404,
                            headers: CORS_HEADERS,  // Ensure CORS headers for dream not found
                            body: JSON.stringify({ message: `Dream ${data.dreamId} not found.` })
                        };
                    }
                    if (firestoreResponse.ok) {
                        return {
                            statusCode: 200,
                            headers: CORS_HEADERS,  // Ensure CORS headers for success response
                            body: JSON.stringify({ success: true, message: `Dream ${data.dreamId} deleted.` })
                        };
                    }
                    break;

                default:
                    return { 
                        statusCode: 400, 
                        headers: CORS_HEADERS,  // Ensure CORS headers for invalid action
                        body: JSON.stringify({ message: "Invalid data action." }) 
                    };
            }
        }
    } catch (err) {
        console.error("Error:", err);
        return {
            statusCode: 500,
            headers: CORS_HEADERS,  // Ensure CORS headers for internal error
            body: JSON.stringify({ message: "Internal Server Error", details: err.message })
        };
    }
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
    
    const base64Data = result?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!base64Data) {
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

    return {
    statusCode: 400,
    headers: CORS_HEADERS,
    body: JSON.stringify({ message: "Unhandled request path." })
};

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

else if (feature === 'prime_directive') {
    const userGoal = body.userGoal; // Assumes you pass this from the frontend
    const emotionalFocus = body.emotionalFocus; // Assumes you pass this from the frontend

    if (!userGoal || !emotionalFocus) {
        return { 
            statusCode: 400, 
            headers: CORS_HEADERS, 
            body: JSON.stringify({ message: 'Missing required goal or emotionalFocus data for Prime Directive.' }) 
        };
    }
    
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
