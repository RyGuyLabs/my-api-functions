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
            if (response.status === 429 || response.status >= 500) {
                if (i === maxRetries - 1) {
                    throw new Error(`Fetch failed after ${maxRetries} retries with status ${response.status}.`);
                }
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
    throw new Error("Fetch failed without a retryable status or network error.");
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
    if (firestoreField.arrayValue) return (firestoreField.arrayValue.values || []).map(firestoreRestToJs);
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
        if (!response.ok) return false;
        const data = await response.json();
        return data?.membershipStatus === 'ACTIVE' || data?.subscription?.status === 'ACTIVE';
    } catch (error) {
        console.error("Error checking Squarespace membership:", error);
        return false;
    }
}

const generateImage = async (imagePrompt, apiKey) => {
    if (!imagePrompt) throw new Error('Missing "imagePrompt" for image generation.');
    const IMAGEN_MODEL = "gemini-2.5-flash-image";
    const IMAGEN_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGEN_MODEL}:generateContent?key=${apiKey}`;
    
    const geminiImagePayload = {
        contents: [{ role: "user", parts: [{ text: imagePrompt }] }]
    };

    const response = await retryFetch(IMAGEN_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiImagePayload)
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Gemini Image API failed: ${response.status} ${errorBody}`);
    }

    const result = await response.json();
    const base64Data = result?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!base64Data) {
        const textResponse = result?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (textResponse) throw new Error(`Gemini returned text instead of image: ${textResponse}`);
        throw new Error("Gemini Image API response did not contain image data.");
    }
    return `data:image/png;base64,${base64Data}`;
};

const generateText = async (feature, userGoal, apiKey) => {
    const systemPrompt = SYSTEM_INSTRUCTIONS[feature];
    if (!systemPrompt) throw new Error(`Unknown feature: ${feature}`);

    const GEMINI_MODEL = "gemini-2.5-flash-preview-09-2025";
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

    const payload = {
        contents: [{ parts: [{ text: userGoal }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] }
    };

    if (feature === "plan" || feature === "smart_goal_structuring") {
        payload.generationConfig = { responseMimeType: "application/json" };
    }

    const response = await retryFetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Gemini Text API failed: ${response.status} ${errorBody}`);
    }

    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (payload.generationConfig?.responseMimeType === "application/json") {
        return JSON.parse(text);
    }
    return text;
};

exports.handler = async (event, context) => {
    const CURRENT_CORS = {
        'Access-Control-Allow-Origin': 'https://www.ryguylabs.com',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Gemini-Model',
        'Access-Control-Max-Age': '86400'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: CURRENT_CORS, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers: CURRENT_CORS, body: JSON.stringify({ message: "Method Not Allowed" }) };
    }

    try {
        const body = JSON.parse(event.body);
        const { action, userId, data, userGoal, imagePrompt } = body;
        const feature = action || body.feature;

        if (feature === 'get_config') {
            return {
                statusCode: 200,
                headers: CURRENT_CORS,
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

        // Feature Dispatching
        if (TEXT_GENERATION_FEATURES.includes(feature)) {
            const aiResponse = await generateText(feature, userGoal || data?.goal, GEMINI_API_KEY);
            return {
                statusCode: 200,
                headers: CURRENT_CORS,
                body: JSON.stringify({ result: aiResponse })
            };
        }

        if (feature === 'generate_image' || imagePrompt) {
            const imageUrl = await generateImage(imagePrompt || data?.imagePrompt, GEMINI_API_KEY);
            return {
                statusCode: 200,
                headers: CURRENT_CORS,
                body: JSON.stringify({ imageUrl })
            };
        }

        if (DATA_OPERATIONS.includes(feature.toUpperCase())) {
            if (!userId) {
                return { statusCode: 401, headers: CURRENT_CORS, body: JSON.stringify({ message: "Unauthorized." }) };
            }

            // Membership Check
            const isAuthorized = await checkSquarespaceMembershipStatus(userId);
            if (!isAuthorized) {
                return { statusCode: 403, headers: CURRENT_CORS, body: JSON.stringify({ message: "Active membership required." }) };
            }

            const userDreamsCollectionPath = `users/${userId}/dreams`;
            let firestoreResponse;

            switch (feature.toUpperCase()) {
                case 'SAVE_DREAM':
                    if (!data) return { statusCode: 400, headers: CURRENT_CORS, body: JSON.stringify({ message: "No data." }) };
                    const dataWithTimestamp = { ...data, timestamp: new Date().toISOString() };
                    const firestoreFields = jsToFirestoreRest(dataWithTimestamp).mapValue.fields;
                    firestoreResponse = await retryFetch(`${FIRESTORE_BASE_URL}${userDreamsCollectionPath}?key=${FIRESTORE_KEY}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ fields: firestoreFields })
                    });
                    if (firestoreResponse.ok) {
                        const result = await firestoreResponse.json();
                        return { statusCode: 200, headers: CURRENT_CORS, body: JSON.stringify({ success: true, name: result.name }) };
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
                        body: JSON.stringify({ 
                            parent: `projects/${PROJECT_ID}/databases/(default)/documents/users/${userId}`, 
                            structuredQuery 
                        })
                    });
                    if (firestoreResponse.ok) {
                        const result = await firestoreResponse.json();
                        const dreams = (result || []).filter(item => item.document).map(item => {
                            const doc = item.document;
                            const fields = firestoreRestToJs({ mapValue: { fields: doc.fields } });
                            return { id: doc.name.split('/').pop(), ...fields };
                        });
                        return { statusCode: 200, headers: CURRENT_CORS, body: JSON.stringify({ dreams }) };
                    }
                    break;

                case 'DELETE_DREAM':
                    if (!data?.dreamId) return { statusCode: 400, headers: CURRENT_CORS, body: JSON.stringify({ message: "No ID." }) };
                    firestoreResponse = await retryFetch(`${FIRESTORE_BASE_URL}users/${userId}/dreams/${data.dreamId}?key=${FIRESTORE_KEY}`, { method: 'DELETE' });
                    if (firestoreResponse.ok) return { statusCode: 200, headers: CURRENT_CORS, body: JSON.stringify({ success: true }) };
                    break;
            }
        }

        return { statusCode: 404, headers: CURRENT_CORS, body: JSON.stringify({ message: "Action not handled." }) };

    } catch (err) {
        console.error("Function Error:", err);
        return {
            statusCode: 500,
            headers: CURRENT_CORS,
            body: JSON.stringify({ message: "Internal Server Error", details: err.message })
        };
    }
};
