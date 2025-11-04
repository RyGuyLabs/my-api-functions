/*** Netlify Function: secure-data-proxy
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
    "dream_energy_analysis"
];

/**
 * @typedef {Object} Dream
 * @property {string} id
 * @property {string} title
 * @property {string} description
 * @property {number} timestamp
 * @property {string} userId
 */

/**
 * @typedef {Object} FirestoreDocument
 * @property {string} name
 * @property {Object} fields
 */
 

// Map feature types to system instructions
const SYSTEM_INSTRUCTIONS = {
    "plan": "You are an expert project manager and motivator. Create a comprehensive, step-by-step action plan to achieve the user's dream. The plan must contain a brief, motivating introduction and a numbered list (ordered list in Markdown) of at least 10 concrete, initial steps or milestones. Deliver the output as clean, raw text suitable for direct display.",
    "pep_talk": "You are RyGuy, a masculine, inspiring, and enthusiastic life coach. Generate an encouraging, short pep talk (about 120 words or less) to motivate the user to start their dream. The tone must be exciting, positive, and direct. The content should be suitable for Text-to-Speech narration. Separate sentences naturally, avoid quotes, symbols, or code formatting, and deliver as raw text.",
    "vision_prompt": "You are a creative visual artist. Based on the user's dream, write a detailed, high-quality, cinematic image generation prompt (max 100 words) suitable for an AI image model like Imagen. The image should be a dramatic, aspirational, and highly detailed visual representation of the dream achieved. Write a prompt to generate a visual representation of this dream's successful completion. Avoid quotes, symbols, or code formatting. Deliver as raw text.",
    "obstacle_analysis": "You are a strategic consultant named RyGuy. Your tone is analytical and practical. Identify up to three potential obstacles the user might face and provide a paragraph for each with practical strategies to overcome them. Separate each obstacle paragraph with a blank line. Avoid lists, symbols, quotes, or code formatting. Deliver as raw text.",
    "positive_spin": "You are an optimistic reframer named RyGuy. Your tone is positive and encouraging. Take the user's negative statement and rewrite it in a single paragraph that highlights opportunities and strengths. Avoid quotes, symbols, code formatting. Deliver as raw text.",
    "mindset_reset": "You are a pragmatic mindset coach named RyGuy. Your tone is direct and actionable. Provide a brief, practical mindset reset in one paragraph. Focus on shifting perspective from a problem to a solution. Avoid lists, symbols, quotes, or code formatting. Deliver as raw text.",
    "objection_handler": "You are a professional sales trainer named RyGuy. Your tone is confident and strategic. Respond to a sales objection in a single paragraph that first acknowledges the objection and then provides a concise, effective strategy to address it. Avoid lists, symbols, quotes, or code formatting. Deliver as raw text.",
    "smart_goal_structuring": `You are a professional goal-setting consultant. Take the user's dream and convert it into a modern, high-value, actionable S.M.A.R.T. goal. Your output MUST include:
- Specific: Clear and precise description of the goal.
- Measurable: Metrics or indicators that track progress.
- Achievable: Realistic yet challenging steps to reach it.
- Relevant: Connect the goal to the user's long-term aspirations or values.
- Time-bound: Define a timeline with milestones and check-ins.
- Next-Level Strategy: Include cutting-edge micro-hacks, modern productivity tools, AI-assisted apps, mindset shifts, or behavioral techniques that accelerate success and provide a unique edge.
Deliver ONLY a single JSON object in this format:

{
  "specific": "...",
  "measurable": "...",
  "achievable": "...",
  "relevant": "...",
  "time_bound": "...",
  "next_level_strategy": "..."
}

Do NOT include any extra text, explanation, or markdown outside of the JSON object.`,
    "dream_energy_analysis": "You are a pragmatic mindset coach named RyGuy. Your tone is direct and actionable. Analyze the user's dream for its emotional and psychological 'energy.' Provide a brief, practical analysis in one paragraph focused on the next actionable feeling or mood the user should adopt (e.g., 'This dream shows high ambition, now harness that energy into quiet, methodical discipline.'). Avoid lists, symbols, quotes, or code formatting. Deliver as raw text."
};

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
};

async function firestoreFetch(path, method = 'GET', bodyObj = null) {
    const url = `${FIRESTORE_BASE_URL}${path}?key=${FIRESTORE_KEY}`;
    const options = { method, headers: { 'Content-Type': 'application/json' } };
    if (bodyObj) options.body = JSON.stringify(bodyObj);

    const res = await fetch(url, options);
    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Firestore fetch failed: ${res.status} - ${errorText}`);
    }
    return res.json();
}

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
 */
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


exports.handler = async function(event) {
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
        const { action, userId, data, userGoal, textToSpeak, imagePrompt, operation } = body;

        const userRequestTimestamps = global.userRequestTimestamps || {};
        global.userRequestTimestamps = userRequestTimestamps;

        function canProceed(userId) {
            const now = Date.now();
            const WINDOW = 60 * 1000; // 1 minute
            const LIMIT = 5;

            if (!userRequestTimestamps[userId]) userRequestTimestamps[userId] = [];
            userRequestTimestamps[userId] = userRequestTimestamps[userId].filter(ts => now - ts < WINDOW);

            if (userRequestTimestamps[userId].length >= LIMIT) return false;
            userRequestTimestamps[userId].push(now);
            return true;
        }

        if (!canProceed(userId)) {
            return {
                statusCode: 429,
                headers: CORS_HEADERS,
                body: JSON.stringify({ message: "Rate limit exceeded. Try again later." })
            };
        }

        const feature = operation || action || body.feature;

        if (!feature) {
            return {
                statusCode: 400,
                headers: CORS_HEADERS,
                body: JSON.stringify({ message: "Missing required 'action' or 'operation' parameter." })
            };
        }

        if (DATA_OPERATIONS.includes(feature.toUpperCase())) {

            if (!userId) {
                return {
                    statusCode: 401,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ message: "Unauthorized: Missing userId for data access." })
                };
            }

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

            const userDreamsCollectionPath = `users/${userId}/dreams`;
            let firestoreResponse;

            switch (feature.toUpperCase()) {
                case 'SAVE_DREAM':
                    if (!data) { return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: "Missing data to save." }) }; }

                    const firestoreFields = jsToFirestoreRest(data).mapValue.fields;

                    firestoreResponse = await firestoreFetch(`${userDreamsCollectionPath}`, 'POST', { fields: firestoreFields });

                    return {
                        statusCode: 200,
                        headers: CORS_HEADERS,
                        body: JSON.stringify({ success: true, result: firestoreResponse })
                    };

                case 'LOAD_DREAMS':
                    const queryBody = {
                        structuredQuery: {
                            from: [{ collectionId: "dreams" }],
                            where: { fieldFilter: { field: { fieldPath: "userId" }, op: "EQUAL", value: { stringValue: userId } } },
                            orderBy: [{ field: { fieldPath: "timestamp" }, direction: "DESCENDING" }]
                        }
                    };

                    const res = await fetch(FIRESTORE_QUERY_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(queryBody)
                    });

                    if (!res.ok) {
                        const text = await res.text();
                        throw new Error(`Firestore query failed: ${text}`);
                    }

                    const rawData = await res.json();
                    const dreams = rawData.map(doc => firestoreRestToJs(doc.document?.fields)).filter(Boolean);

                    return {
                        statusCode: 200,
                        headers: CORS_HEADERS,
                        body: JSON.stringify({ success: true, dreams })
                    };

                case 'DELETE_DREAM':
                    if (!data?.id) { return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: "Missing dream id to delete." }) }; }

                    firestoreResponse = await firestoreFetch(`${userDreamsCollectionPath}/${data.id}`, 'DELETE');

                    return {
                        statusCode: 200,
                        headers: CORS_HEADERS,
                        body: JSON.stringify({ success: true, result: firestoreResponse })
                    };
            }
        }

        // ✅ Enhanced AI text generation handler
if (TEXT_GENERATION_FEATURES.includes(feature)) {
    console.log("🧠 AI generation request received:", { feature, userGoal });

    if (!userGoal || userGoal.trim() === '') {
        console.error("❌ Missing userGoal for AI request");
        return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: "Missing 'userGoal' in request body." })
        };
    }

    const promptTemplate = SYSTEM_INSTRUCTIONS[feature];
    const fullPrompt = promptTemplate.replace(/\$\{userGoal\}/g, userGoal);

    const aiRequest = {
  contents: [
    {
      role: "user",
      parts: [
        {
          text: `You are a professional goal-setting consultant. Take the user's dream and convert it into a modern, high-value, actionable S.M.A.R.T. goal. Your output MUST include:
- Specific: Clear and precise description of the goal.
- Measurable: Metrics or indicators that track progress.
- Achievable: Realistic yet challenging steps to reach it.
- Relevant: Connect the goal to the user's long-term aspirations or values.
- Time-bound: Define a timeline with milestones and check-ins.
- Next-Level Strategy: Include cutting-edge micro-hacks, modern productivity tools, AI-assisted apps, mindset shifts, or behavioral techniques that accelerate success and provide a unique edge.
Deliver ONLY a single JSON object in this format:

{
  "specific": "...",
  "measurable": "...",
  "achievable": "...",
  "relevant": "...",
  "time_bound": "...",
  "next_level_strategy": "..."
}

Do NOT include any extra text, explanation, or markdown outside of the JSON object.

User goal: "${userGoal}"`
        }
      ]
    }
  ],
  generationConfig: {
    temperature: 0.7,
    candidateCount: 1
  }
};

    console.log("📤 Sending to Gemini API:", aiRequest);

    try {
        const aiResponse = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${GEMINI_API_KEY}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(aiRequest)
  }
);


        if (!aiResponse.ok) {
            const errText = await aiResponse.text();
            console.error("❌ Gemini API error:", errText);
            throw new Error(`AI text generation failed: ${errText}`);
        }

        let aiData;
        try {
            aiData = await aiResponse.json();
        } catch (err) {
            console.error("❌ Failed to parse Gemini response:", err);
            throw new Error("AI text generation failed: invalid JSON response");
        }

        const textOutput =
            aiData?.candidates?.[0]?.content?.[0]?.text?.trim() ||
            "[AI failed to generate content]";

        console.log("✅ Gemini API response received:", textOutput.slice(0, 100));
        return {
            statusCode: 200,
            headers: CORS_HEADERS,
            body: JSON.stringify({ text: textOutput })
        };
    } catch (err) {
        console.error("❌ AI text generation failed:", err);
        return {
            statusCode: 500,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: `AI text generation failed: ${err.message}` })
        };
    }
}

        if (feature === 'image_generation') {
            const imgPrompt = imagePrompt || `A cinematic, motivational, high-quality representation of ${userGoal}`;
            const imgRes = await fetch(`https://generativelanguage.googleapis.com/v1beta2/models/image-vision-001:generateImage?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: imgPrompt,
                    size: '1024x1024'
                })
            });

            if (!imgRes.ok) {
                const errText = await imgRes.text();
                throw new Error(`Image generation failed: ${errText}`);
            }

            const result = await imgRes.json();
            const base64Data = result?.predictions?.[0]?.bytesBase64Encoded;

            if (!base64Data) {
                throw new Error("No image data returned from AI image model.");
            }

            const altTextToUse = body.altText || `Generated vision for: ${imgPrompt}`;

            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({
                    imageUrl: `data:image/png;base64,${base64Data}`,
                    altText: altTextToUse
                })
            };
        }

        if (feature === 'tts_generation') {
            if (!textToSpeak) {
                return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: "Missing text to generate TTS." }) };
            }

            const ttsRes = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    input: { text: textToSpeak },
                    voice: { languageCode: 'en-US', name: 'en-US-Standard-B' },
                    audioConfig: { audioEncoding: 'MP3' }
                })
            });

            if (!ttsRes.ok) {
                const errText = await ttsRes.text();
                throw new Error(`TTS generation failed: ${errText}`);
            }

            const ttsData = await ttsRes.json();
            const audioContent = ttsData?.audioContent || null;

            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({ audioContent })
            };
        }

        return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: "Unknown feature requested." })
        };

    } catch (err) {
        console.error(err);
        return {
            statusCode: 500,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: err.message || "Internal server error" })
        };
    }
};
