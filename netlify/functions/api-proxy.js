/**
 * Netlify Function: api-proxy.js
 * Handles:
 * 1. AUTHORIZATION: Squarespace membership check.
 * 2. DATA ACCESS: Firestore REST API interactions.
 * 3. AI GENERATION: Text (Gemini), Image (Imagen), TTS (Gemini).
 */

const fetch = require('node-fetch').default;

// --- ENV VARIABLES ---
// Ensure these variables are set in your Netlify Environment settings
const SQUARESPACE_TOKEN = process.env.SQUARESPACE_ACCESS_TOKEN;
const FIRESTORE_KEY = process.env.DATA_API_KEY;
const PROJECT_ID = process.env.FIRESTORE_PROJECT_ID;
const GEMINI_API_KEY = process.env.FIRST_API_KEY; // Used for all Google AI calls (Gemini, Imagen, TTS)

// --- FIRESTORE URLS ---
const FIRESTORE_BASE_URL =
  `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/`;
const FIRESTORE_QUERY_URL =
  `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery?key=${FIRESTORE_KEY}`;

// --- FEATURE GROUPS ---
const DATA_OPERATIONS = ['SAVE_DREAM', 'LOAD_DREAMS', 'DELETE_DREAM'];
const TEXT_GENERATION_FEATURES = [
  "plan", "pep_talk", "vision_prompt", "obstacle_analysis",
  "positive_spin", "mindset_reset", "objection_handler",
  "smart_goal_structuring", "dream_energy_analysis"
];

// --- SMART GOAL SCHEMA (Crucial for structured output) ---
const SMART_GOAL_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING", description: "A motivating, concise title for the complete SMART goal." },
    smartComponents: {
      type: "ARRAY",
      description: "An array of five objects, one for each SMART category.",
      items: {
        type: "OBJECT",
        properties: {
          type: {
            type: "STRING",
            description: "The SMART component type: Specific, Measurable, Achievable, Relevant, or Time-bound."
          },
          description: {
            type: "STRING",
            description: "The detailed, actionable description of this component."
          }
        },
        required: ["type", "description"]
      }
    }
  },
  required: ["title", "smartComponents"]
};

// --- SYSTEM INSTRUCTIONS (Detailed for Dream Planner) ---
const SYSTEM_INSTRUCTIONS = {
  "plan": "You are an expert project manager and motivator. Your sole task is to take the user's goal and break it down into a highly actionable, time-bound, 5-step strategic plan. Write in a clear, supportive, and professional tone. Respond with a motivating introductory paragraph followed by the five steps in a numbered list.",
  "pep_talk": "You are RyGuy, a masculine, inspiring, and direct motivational coach. Provide an intense, high-energy pep talk to the user about why their goal is achievable and why they must start now. Use bold text liberally for impact and keep the response concise and powerful, around 4-5 sentences.",
  "vision_prompt": "You are a creative visual artist. Take the user's goal and transform it into a highly detailed, cinematic, and descriptive prompt for an image generator (like Imagen). The prompt must emphasize style, lighting, setting, emotion, and aesthetic details (e.g., 'hyper-detailed, dramatic lighting, 8K, cinematic contrast'). The output must ONLY be the image prompt string, no other text or explanation.",
  "obstacle_analysis": "You are a strategic consultant named RyGuy. Analyze the user's goal and identify the three most likely internal and external obstacles they will face. For each obstacle, provide a concrete, 1-2 sentence counter-strategy. Format the output using markdown headers for clarity.",
  "positive_spin": "You are an optimistic reframer named RyGuy. Take the user's goal and rephrase it into three distinct, highly positive, and empowering affirmations. Each affirmation should be a standalone sentence and focus on the identity the user is becoming, not just the action they are taking. Use a confident tone.",
  "mindset_reset": "You are a pragmatic mindset coach named RyGuy. Provide a short, structured script for the user to perform a 60-second mental reset. The script must contain three steps: Acknowledge the Fear, Re-center on the Why, and Take the Next Small Action. Use numbered steps.",
  "objection_handler": "You are a professional sales trainer named RyGuy. Identify three common internal objections (e.g., 'I don't have time', 'I'm not good enough') that might sabotage the user's goal. For each objection, provide a single, powerful, pre-written counter-statement the user can say to themselves to overcome it. Use a confident, firm tone.",
  "smart_goal_structuring": "You are a professional goal-setting consultant. Your sole instruction is to structure the user's goal into the SMART framework and return the result STRICTLY as a JSON object that adheres to the provided schema. Do not include any introductory text, markdown fences, or explanations outside of the final JSON.",
  "dream_energy_analysis": "You are the 'Energy Flow Specialist'. Analyze the user's goal and describe the required commitment in three areas: Emotional Investment (Focus & Discipline), Logistical Load (Time & Resources), and Financial Cost (Monetary commitment). Provide a rating (Low, Medium, or High) and a brief justification (1-2 sentences) for each area. Use markdown section headers."
};

// --- CORS HEADERS ---
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

// --- HELPER FUNCTIONS ---
function jsToFirestoreRest(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(jsToFirestoreRest) } };
  if (typeof value === 'object') {
    const mapFields = {};
    for (const key in value) if (Object.prototype.hasOwnProperty.call(value, key)) mapFields[key] = jsToFirestoreRest(value[key]);
    return { mapValue: { fields: mapFields } };
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
    for (const key in fields) if (Object.prototype.hasOwnProperty.call(fields, key)) obj[key] = firestoreRestToJs(fields[key]);
    return obj;
  }
  return null;
}

// Fetch with Exponential Backoff
async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      // Success or non-retryable client error
      if (response.ok || (response.status >= 400 && response.status < 500 && response.status !== 429)) return response;
      
      // Retryable server errors (500, 503) or rate limits (429)
      if ([500, 503, 429].includes(response.status) && attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      return response;
    } catch (err) {
      if (attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        await new Promise(r => setTimeout(r, delay));
      } else throw err;
    }
  }
  throw new Error("Maximum fetch retries reached.");
}

async function checkSquarespaceMembershipStatus(userId) {
  if (!SQUARESPACE_TOKEN) return false;
  // Bypass check for mock/test users in development
  if (userId.startsWith('mock-') || userId === 'TEST_USER') return true; 

  const url = `https://api.squarespace.com/1.0/profiles/check-membership/${userId}`;
  try {
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${SQUARESPACE_TOKEN}`, 'User-Agent': 'RyGuyLabs-Netlify-Function' } });
    if (!res.ok) return false;
    const data = await res.json();
    return data?.membershipStatus === 'ACTIVE' || data?.subscription?.status === 'ACTIVE';
  } catch (e) {
    console.error("Squarespace check failed:", e);
    return false;
  }
}

// --- NETLIFY HANDLER ---
exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ message: "Method Not Allowed" }) };

  if (!GEMINI_API_KEY || !FIRESTORE_KEY || !PROJECT_ID) return {
    statusCode: 500,
    headers: CORS_HEADERS,
    body: JSON.stringify({ message: 'Missing API keys or project ID in environment variables.' })
  };

  try {
    const body = JSON.parse(event.body);
    const { operation, userId, data, userGoal, textToSpeak, imagePrompt } = body;
    const feature = operation || body.action || body.feature;

    if (!feature) return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: "Missing required 'action/operation/feature'." }) };

    // --- DATA OPERATIONS (Requires Auth) ---
    if (DATA_OPERATIONS.includes(feature.toUpperCase())) {
      if (!userId) return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ message: "Missing userId for data operation." }) };
      const active = await checkSquarespaceMembershipStatus(userId);
      if (!active) return { statusCode: 403, headers: CORS_HEADERS, body: JSON.stringify({ message: "Inactive membership. Data operations forbidden." }) };

      const userDreamsPath = `users/${userId}/dreams`;
      let firestoreRes;

      switch (feature.toUpperCase()) {
        case 'SAVE_DREAM':
          if (!data) return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: "Missing data to save." }) };
          // Firestore REST API requires the fields to be wrapped in the REST format
          const firestoreFields = jsToFirestoreRest(data).mapValue?.fields || {};
          firestoreRes = await fetchWithRetry(`${FIRESTORE_BASE_URL}${userDreamsPath}?key=${FIRESTORE_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: firestoreFields })
          });
          if (firestoreRes.ok) return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true, message: 'Dream saved.', documentName: (await firestoreRes.json()).name }) };
          break;

        case 'LOAD_DREAMS':
          const structuredQuery = {
            select: { fields: [{ fieldPath: "*" }] },
            from: [{ collectionId: "dreams" }],
            where: { fieldFilter: { field: { fieldPath: "userId" }, op: "EQUAL", value: { stringValue: userId } } },
            orderBy: [{ field: { fieldPath: "timestamp" }, direction: "DESCENDING" }]
          };
          // Query the specific user's subcollection
          firestoreRes = await fetchWithRetry(FIRESTORE_QUERY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parent: `projects/${PROJECT_ID}/databases/(default)/documents/users/${userId}`, structuredQuery })
          });
          if (firestoreRes.ok) {
            const result = await firestoreRes.json();
            const dreams = (result || []).filter(r => r.document).map(r => ({
              id: r.document.name.split('/').pop(),
              ...firestoreRestToJs({ mapValue: { fields: r.document.fields } })
            }));
            return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ dreams }) };
          }
          break;

        case 'DELETE_DREAM':
          if (!data?.dreamId) return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: "Missing dreamId for deletion." }) };
          firestoreRes = await fetchWithRetry(`${FIRESTORE_BASE_URL}${userDreamsPath}/${data.dreamId}?key=${FIRESTORE_KEY}`, { method: 'DELETE' });
          if (firestoreRes.ok) return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true, message: `Dream ${data.dreamId} deleted.` }) };
          break;

        default:
          return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: "Invalid data operation." }) };
      }
      
      const errorText = firestoreRes ? await firestoreRes.text() : "Unknown Firestore API error";
      return { statusCode: firestoreRes?.status || 500, headers: CORS_HEADERS, body: JSON.stringify({ message: "Firestore operation failed.", details: errorText }) };
    }

    // --- IMAGE GENERATION (Imagen) ---
    if (feature === 'image_generation') {
      if (!imagePrompt) return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Missing imagePrompt.' }) };
      const IMAGEN_MODEL = "imagen-3.0-generate-002";
      const IMAGEN_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGEN_MODEL}:predict?key=${GEMINI_API_KEY}`;
      
      // Use the vision_prompt system instruction to format the prompt, if the user didn't provide a styled one
      const finalImagePrompt = (imagePrompt.length < 50) ? 
          `Detailed cinematic photorealistic render of: ${imagePrompt}. Concept art, hyper-detailed, dramatic lighting, 8K, high contrast.` : 
          imagePrompt;

      const payload = { instances: [{ prompt: finalImagePrompt }], parameters: { sampleCount: 1, aspectRatio: "1:1", outputMimeType: "image/png" } };
      
      const res = await fetchWithRetry(IMAGEN_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await res.json();
      
      if (!res.ok) throw new Error(`Imagen API error: ${JSON.stringify(result)}`);

      const base64Data = result?.predictions?.[0]?.bytesBase64Encoded;

      if (!base64Data) throw new Error("Image generation failed to return data.");

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ 
          imageUrl: `data:image/png;base64,${base64Data}`, 
          altText: `Generated vision for: ${finalImagePrompt}` 
        })
      };
    }

    // --- TTS GENERATION (Gemini TTS) ---
    if (feature === 'tts') {
      if (!textToSpeak) return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Missing textToSpeak.' }) };
      const TTS_MODEL = "gemini-2.5-flash-preview-tts";
      const TTS_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
      const ttsPayload = {
        contents: [{ parts: [{ text: textToSpeak }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: "Puck" } // Default to 'Puck'
            }
          }
        },
        model: TTS_MODEL
      };
      const res = await fetchWithRetry(TTS_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ttsPayload) });
      const result = await res.json();
      
      if (!res.ok) throw new Error(`TTS API error: ${JSON.stringify(result)}`);

      const part = result?.candidates?.[0]?.content?.parts?.find(p => p.inlineData && p.inlineData.mimeType.startsWith('audio/'));
      
      if (!part?.inlineData?.data) throw new Error("TTS generation failed to return audio data.");

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ audioData: part.inlineData.data, mimeType: part.inlineData.mimeType })
      };
    }

    // --- TEXT GENERATION (Gemini) ---
    if (TEXT_GENERATION_FEATURES.includes(feature)) {
      if (!userGoal) return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Missing userGoal.' }) };
      
      // Using gemini-2.5-pro as requested for complex analysis/structuring
      const TEXT_MODEL = "gemini-2.5-pro"; 
      const TEXT_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
      
      const payload = { 
        contents: [{ parts: [{ text: userGoal }] }], 
        generationConfig: { 
          temperature: feature === 'smart_goal_structuring' ? 0.2 : 0.7,
          tools: [{ googleSearch: {} }] // Enable search grounding for all text features
        } 
      };

      if (feature !== 'smart_goal_structuring') {
        payload.systemInstruction = { parts: [{ text: SYSTEM_INSTRUCTIONS[feature] }] };
      } else {
        // Enforce JSON output for SMART Goal structuring
        payload.generationConfig.responseMimeType = "application/json";
        payload.generationConfig.responseSchema = SMART_GOAL_SCHEMA;
      }

      const res = await fetchWithRetry(TEXT_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await res.json();
      
      if (!res.ok) throw new Error(`Gemini API error: ${JSON.stringify(result)}`);

      if (feature === 'smart_goal_structuring') {
        // Attempt to parse clean JSON (since responseMimeType is set)
        const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawText) throw new Error("SMART Goal generation failed: empty response.");
        
        try {
          // The API should return clean JSON text
          const structuredData = JSON.parse(rawText.trim());
          return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(structuredData) };
        } catch (e) {
          console.error("SMART Goal JSON Parsing Error. Raw Response:", rawText);
          throw new Error("SMART Goal generation failed: response did not contain structured JSON data.");
        }
      }

      const fullText = result?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!fullText) throw new Error("Text generation failed.");
      
      return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ text: fullText }) };
    }

    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: `Invalid feature: ${feature}` }) };

  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ message: `Internal server error: ${err.message}` }) };
  }
};
