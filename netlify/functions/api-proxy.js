const fetch = require('node-fetch');

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
            const response = await fetch(url, options);
            if (response.status === 429 || response.status >= 500) {
                if (i === maxRetries - 1) throw new Error(`Fetch failed after ${maxRetries} retries.`);
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
    
    // Explicitly using gemini-2.5-flash-image-preview for this environment
    const IMAGEN_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${GEMINI_API_KEY}`;
    
    const geminiImagePayload = {
        contents: [{
            parts: [{ text: imagePrompt }]
        }],
        generationConfig: {
            responseModalities: ['TEXT', 'IMAGE']
        }
    };

    const response = await fetch(IMAGEN_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiImagePayload)
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error("Gemini API Error:", response.status, errorBody);
        throw new Error(`Gemini API failed with status ${response.status}: ${response.statusText}. Error body: ${errorBody}`);
    }

    const result = await response.json();
    const base64Data = result?.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;

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
                            .filter(Boolean); // remove null entries

                        return {
                            statusCode: 200,
                            headers: CORS_HEADERS, 
                            body: JSON.stringify({ dreams })
                        };
                    }
                    break;

                case 'DELETE_DREAM':
                    if (!data || !data.dreamId) {
                        return { 
                            statusCode: 400, 
                            headers: CORS_HEADERS, 
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
                            headers: CORS_HEADERS,  
                            body: JSON.stringify({ message: `Dream ${data.dreamId} not found.` })
                        };
                    }
                    if (firestoreResponse.ok) {
                        return {
                            statusCode: 200,
                            headers: CORS_HEADERS,  
                            body: JSON.stringify({ success: true, message: `Dream ${data.dreamId} deleted.` })
                        };
                    }
                    break;

                default:
                    return { 
                        statusCode: 400, 
                        headers: CORS_HEADERS,  
                        body: JSON.stringify({ message: "Invalid data action." }) 
                    };
            }
        }

        // --- AI Features ---
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

        else if (feature === 'prime_directive') {
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
                contents: [{ parts: [{ text: userPrompt }] }],
                systemInstruction: { parts: [{ text: PRIME_DIRECTIVE_INSTRUCTION }] },
                generationConfig: {
                    temperature: 0.2,
                    responseMimeType: "application/json"
                }
            };

            const response = await retryFetch(TEXT_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error(`Prime Directive API failed.`);

            const result = await response.json();
            const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;

            try {
                const parsedContent = JSON.parse(rawText);
                const imagePromptStr = parsedContent.image_prompt;
                const commandText = parsedContent.command_text;

                let imageUrl = '';
                if (imagePromptStr) {
                    try {
                        imageUrl = await generateImage(imagePromptStr, GEMINI_API_KEY);
                    } catch (e) {
                        console.warn("Prime Directive Image Generation Failed:", e.message);
                    }
                }

                return {
                    statusCode: 200,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({
                        imagePrompt: imagePromptStr,
                        commandText: commandText,
                        imageUrl: imageUrl 
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

        else if (feature === 'break_barrier' || feature === 'dream_energy_analysis') {
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

User's Goal: "${userGoal}"
${emotionalFocus ? `Emotional Anchor (for added depth): "${emotionalFocus}"` : ''}

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

            if (!response.ok) throw new Error(`Barrier Breaker API failed.`);

            const result = await response.json();
            const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;

            try {
                const parsedContent = JSON.parse(rawText);
                if (!parsedContent.internalConflict || !parsedContent.externalPrescription) {
                    throw new Error("Parsed JSON missing required Barrier Breaker fields.");
                }
                return {
                    statusCode: 200,
                    headers: CORS_HEADERS,
                    body: JSON.stringify(parsedContent)
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
                generationConfig: (feature === "plan" || feature === "smart_goal_structuring") ? { responseMimeType: "application/json" } : {}
            };

            const response = await retryFetch(TEXT_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`Text Generation API failed with status ${response.status}`);
            }

            const result = await response.json();
            const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!rawText) throw new Error("Text Generation API response did not contain generated text.");

            let parsedContent = null;
            let responseKey = 'text'; 

            if (feature === "plan" || feature === "smart_goal_structuring") {
                try {
                    parsedContent = JSON.parse(rawText);
                    responseKey = feature === "plan" ? 'plan' : 'smartGoal';
                } catch (jsonError) {
                    console.warn(`[RyGuyLabs] Feature ${feature} returned non-JSON. Fallback used.`);
                    parsedContent = rawText;
                }
            }

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
