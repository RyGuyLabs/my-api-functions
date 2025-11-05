/**
 * Netlify Function: api-proxy.js
 * * This function serves as the single secure gateway for ALL features (AI & Data)
 * for the Squarespace frontend.
 * * It handles:
 * 1. AUTHORIZATION: Checks for active subscription status via Squarespace.
 * 2. DATA ACCESS: Interacts with the secure Firestore database (REST API).
 * 3. AI GENERATION: Text (Gemini Flash), Image (Imagen), and TTS (Gemini TTS).
 * * Environment Variables required:
 * - FIRST_API_KEY (Your existing key): Used for all Google AI calls.
 * - SQUARESPACE_ACCESS_TOKEN (NEW): Token to query Squarespace for membership status.
 * - DATA_API_KEY (NEW): Google API Key for Firestore REST API access.
 * - FIRESTORE_PROJECT_ID (NEW): The ID of the Firebase project.
 * * **Update:** Switch cases are now wrapped in braces {} for explicit variable scoping, 
 * ensuring no conflicts (e.g., const res) across cases.
 */

// Use standard CommonJS import for node-fetch assuming a .js file.
const fetch = require('node-fetch');

// --- GLOBAL SETUP FOR DATA & SECURITY ---
const SQUARESPACE_TOKEN = process.env.SQUARESPACE_ACCESS_TOKEN;
const FIRESTORE_KEY = process.env.DATA_API_KEY;
const PROJECT_ID = process.env.FIRESTORE_PROJECT_ID;
const GEMINI_API_KEY = process.env.FIRST_API_KEY;

// Base URL for the Firestore REST API (Used for document-specific operations like POST/DELETE/LIST)
const FIRESTORE_BASE_URL =
  `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/`;

// --- CORE CONFIGURATION ---

const TEXT_GENERATION_FEATURES = [
  "plan", "pep_talk", "vision_prompt", "obstacle_analysis",
  "positive_spin", "mindset_reset", "objection_handler",
  "smart_goal_structuring",
  "dream_energy_analysis"
];

// --- Schema for Structured Output (S.M.A.R.T. Goal) ---
const SMART_GOAL_SCHEMA = {
  type: "object",
  properties: {
    goalTitle: { type: "string", description: "A concise, inspiring title for the S.M.A.R.T. goal." },
    specific: { type: "string", description: "A statement explaining what exactly will be accomplished." },
    measurable: { type: "string", description: "A statement defining the metrics used to track progress." },
    achievable: { type: "string", description: "A statement confirming the necessary skills, resources, and realism of the goal." },
    relevant: { type: "string", description: "A statement explaining why this goal is important and how it aligns with the user's dream." },
    timeBound: { type: "string", description: "A statement defining the specific deadline for goal completion." }
  },
  required: ["goalTitle", "specific", "measurable", "achievable", "relevant", "timeBound"]
};

// --- Schema for Structured Output (Dream Energy) ---
const DREAM_ENERGY_SCHEMA = {
  type: "object",
  properties: {
    confidence: { type: "integer", description: "A 0-100 score for the goal's confidence level." },
    consistency: { type: "integer", description: "A 0-100 score for the goal's consistency requirements." },
    creativity: { type: "integer", description: "A 0-100 score for the goal's creativity." },
    actionableInsight: { type: "string", description: "A single, short, actionable insight based on the scores." }
  },
  required: ["confidence", "consistency", "creativity", "actionableInsight"]
};

// Map feature types to system instructions
const SYSTEM_INSTRUCTIONS = {
  "plan": "You are an expert project manager and motivator. Create a comprehensive, step-by-step action plan to achieve the user's dream. The plan must contain a brief, motivating introduction and a numbered list (ordered list in Markdown) of at least 10 concrete, initial steps or milestones. Deliver the output as clean, raw text suitable for direct display.",
  "pep_talk": "You are RyGuy, a masculine, inspiring, and enthusiastic life coach. Generate an encouraging, short pep talk (about 120 words or less) to motivate the user to start their dream. The tone must be exciting, positive, and direct. The content should be suitable for Text-to-Speech narration. Separate sentences naturally, avoid quotes, symbols, or code formatting, and deliver the output as raw text.",
  "vision_prompt": "You are a creative visual artist. Based on the user's dream, write a detailed, high-quality, cinematic image generation prompt (max 100 words) suitable for an AI image model like Imagen. The image should be a dramatic, aspirational, and highly detailed visual representation of the dream achieved. Write a prompt to generate a visual representation of this dream's successful completion. Avoid quotes, symbols, or code formatting. Deliver as raw text.",
  "obstacle_analysis": "You are a strategic consultant named RyGuy. Your tone is analytical and practical. Identify up to three potential obstacles the user might face and provide a paragraph for each with practical strategies to overcome them. Separate each obstacle paragraph with a blank line. Avoid lists, symbols, quotes, or code formatting. Deliver as raw text.",
  "positive_spin": "You are an optimistic reframer named RyGuy. Your tone is positive and encouraging. Take the user's negative statement and rewrite it in a single paragraph that highlights opportunities and strengths. Avoid quotes, symbols, or code formatting. Deliver as raw text.",
  "mindset_reset": "You are a pragmatic mindset coach named RyGuy. Your tone is direct and actionable. Provide a brief, practical mindset reset in one paragraph. Focus on shifting perspective from a problem to a solution. Avoid lists, symbols, quotes, or code formatting. Deliver as raw text.",
  "objection_handler": "You are a professional sales trainer named RyGuy. Your tone is confident and strategic. Respond to a sales objection in a single paragraph that first acknowledges the objection and then provides a concise, effective strategy to address it. Avoid lists, symbols, quotes, or code formatting. Deliver as raw text.",
  "smart_goal_structuring": "You are a professional goal-setting consultant. Take the user's dream and convert it into a well-structured, inspiring S.M.A.R.T. goal. You MUST return only a single JSON object that conforms to the provided schema. Do not include any text, notes, or markdown outside of the JSON block.",
  "dream_energy_analysis": "You are a pragmatic mindset coach named RyGuy. Analyze the user's dream for its emotional and psychological 'energy.' You MUST return only a single JSON object that conforms to the provided schema, with scores for confidence, consistency, creativity, and an actionable insight."
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

// --- FIRESTORE REST API HELPERS ---

/** Converts a JavaScript value into the Firestore REST API format (Fields Map). */
function jsToFirestoreRest(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };

  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(jsToFirestoreRest) } };
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

/** Converts a Firestore REST API Field Map back into a JavaScript object. */
function firestoreRestToJs(firestoreField) {
  if (!firestoreField) return null;

  if (firestoreField.nullValue !== undefined) return null;
  if (firestoreField.stringValue !== undefined) return firestoreField.stringValue;
  if (firestoreField.integerValue !== undefined) return parseInt(firestoreField.integerValue, 10);
  if (firestoreField.doubleValue !== undefined) return firestoreField.doubleValue;
  if (firestoreField.booleanValue !== undefined) return firestoreField.booleanValue;
  if (firestoreField.timestampValue !== undefined) return new Date(firestoreField.timestampValue).toISOString();

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

// --- NETWORK HELPERS ---

async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      // Return immediately on success or non-retryable client errors (4xx except 429)
      if (response.ok || (response.status >= 400 && response.status < 500 && response.status !== 429)) {
        return response;
      }

      // Retry on 5xx errors or 429
      if (attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000 + (Math.random() * 500); 
        console.log(`[RETRY] Attempt ${attempt + 1}/${maxRetries} failed with status ${response.status}. Retrying in ${delay.toFixed(0)}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue; 
      }
      
      return response; // Last attempt, return the error response
    } catch (error) {
      if (attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000 + (Math.random() * 500);
        console.log(`[RETRY] Network error on attempt ${attempt + 1}/${maxRetries}. Retrying in ${delay.toFixed(0)}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error; // Last attempt, throw the network error
      }
    }
  }
  throw new Error("Maximum fetch retries reached.");
}

// --- AUTHORIZATION HELPER ---
async function checkSquarespaceMembershipStatus(userId) {
  // Allow mock users for local testing
  if (userId && (userId.startsWith('mock-') || userId === 'TEST_USER')) {
    console.log(`[AUTH-MOCK] Bypassing Squarespace check for mock user: ${userId}`);
    return true;
  }

  if (!SQUARESPACE_TOKEN) {
    console.error("SQUARESPACE_ACCESS_TOKEN is missing. Blocking access.");
    return false;
  }

  try {
    const res = await fetchWithRetry(`https://api.squarespace.com/1.0/profiles/check-membership/${userId}`, {
      method: 'GET',
      headers: { 
        'Authorization': `Bearer ${SQUARESPACE_TOKEN}`,
        'User-Agent': 'RyGuyLabs-Netlify-Function'
      }
    });

    if (!res.ok) {
      console.warn(`Squarespace API returned error for user ${userId}: ${res.status}`);
      return false;
    }
    
    const data = await res.json();
    const isActive = data?.membershipStatus === 'ACTIVE' || data?.subscription?.status === 'ACTIVE';

    if (!isActive) {
       console.log(`User ${userId} is INACTIVE. Access denied.`);
    }

    return isActive;

  } catch (error) {
    console.error("Squarespace API error:", error);
    return false; // Deny access on failure
  }
}

// --- MAIN HANDLER ---

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Method Not Allowed' }) };
  }

  if (!GEMINI_API_KEY || !FIRESTORE_KEY || !PROJECT_ID) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Missing critical API keys (AI, Firestore, or Project ID).' }) };
  }

  let body;
  // --- DEFENSIVE JSON PARSING ---
  try { 
    body = event.body ? JSON.parse(event.body) : {}; 
  } 
  catch (e) { 
    return { 
      statusCode: 400, 
      headers: CORS_HEADERS, 
      body: JSON.stringify({ message: 'Invalid JSON body. Parsing Error: ' + e.message }) 
    }; 
  }

  // Operation can be 'action' (for AI) or 'operation' (for Data)
  const { operation, action, userId, data, userGoal, textToSpeak, voice } = body;
  const feature = operation || action || body.feature;

  if (!feature) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Missing required "operation" or "action" parameter.' }) };
  }

  try {
    // --- SECTION 1: DATA OPERATIONS (SAVE/LOAD/DELETE) ---
    if (['SAVE_DREAM','LOAD_DREAMS','DELETE_DREAM'].includes(feature.toUpperCase())) {
      if (!userId) {
        return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Missing userId for data access.' }) };
      }

      const isActive = await checkSquarespaceMembershipStatus(userId);
      if (!isActive) {
        return { statusCode: 403, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Forbidden: No active RyGuyLabs membership found.' }) };
      }
      
      const dreamDocumentPath = `users/${userId}/dreams`;

      switch (feature.toUpperCase()) {
        // Wrapped in braces {} for explicit block scope
        case 'SAVE_DREAM': {
          if (!data) { return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Missing data to save.' }) }; }
          
          const saveData = { ...data, timestamp: new Date().toISOString() };
          const firestoreFields = jsToFirestoreRest(saveData).mapValue?.fields;
          
          if (!firestoreFields) { return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Invalid data format for saving.' }) }; }

          const res = await fetchWithRetry(`${FIRESTORE_BASE_URL}${dreamDocumentPath}?key=${FIRESTORE_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: firestoreFields })
          });

          if (!res.ok) throw new Error(await res.text());
          const result = await res.json();
          return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true, documentName: result.name }) };
        }
        
        // Wrapped in braces {} for explicit block scope
        case 'LOAD_DREAMS': {
          const res = await fetchWithRetry(`${FIRESTORE_BASE_URL}${dreamDocumentPath}?key=${FIRESTORE_KEY}`, {
            method: 'GET'
          });

          if (!res.ok) throw new Error(await res.text());

          const loadResult = await res.json();
          const dreams = (loadResult.documents || [])
            .map(doc => {
              const docId = doc.name.split('/').pop();
              const fields = firestoreRestToJs({ mapValue: { fields: doc.fields } });
              return { id: docId, ...fields };
            });

          dreams.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
          
          return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ dreams }) };
        }

        // Wrapped in braces {} for explicit block scope
        case 'DELETE_DREAM': {
          if (!data || !data.dreamId) { return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: "Missing dreamId for deletion." }) }; }
          
          const fullDocumentPath = `${dreamDocumentPath}/${data.dreamId}`;
          const res = await fetchWithRetry(`${FIRESTORE_BASE_URL}${fullDocumentPath}?key=${FIRESTORE_KEY}`, {
            method: 'DELETE'
          });
          
          if (!res.ok) throw new Error(await res.text());
          
          return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true, message: `Dream ${data.dreamId} deleted.` }) };
        }

        default:
          return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: `Invalid data operation: ${feature}` }) };
      }
    }

    // --- SECTION 2: AI GENERATION (UN-GATED) ---

    // --- 2a. Image Generation (vision_prompt -> Gemini Prompt -> Imagen Image) ---
    if (feature === 'vision_prompt') {
      if (!userGoal) { return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Missing userGoal for image prompt.' }) }; }

      // 1. Generate the Image Prompt using Gemini Flash
      const PROMPT_MODEL = "gemini-2.5-flash-preview-09-2025";
      const PROMPT_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${PROMPT_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
      const promptPayload = {
        contents: [{ parts: [{ text: userGoal }] }],
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTIONS["vision_prompt"] }] },
        generationConfig: { temperature: 0.8 },
      };

      const promptRes = await fetchWithRetry(PROMPT_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(promptPayload) });
      const promptResult = await promptRes.json();
      if (!promptRes.ok) throw new Error(`Gemini prompt generation error: ${JSON.stringify(promptResult)}`);
      
      const generatedImagePrompt = promptResult?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!generatedImagePrompt) throw new Error("Image prompt generation failed.");

      // 2. Generate the Image using Imagen
      const IMAGEN_MODEL = "imagen-3.0-generate-002";
      const IMAGEN_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGEN_MODEL}:predict?key=${GEMINI_API_KEY}`;
      const imagenPayload = {
        instances: [{ prompt: generatedImagePrompt }], 
        parameters: { sampleCount: 1, aspectRatio: "1:1", outputMimeType: "image/png" }
      };

      const res = await fetchWithRetry(IMAGEN_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(imagenPayload)
      });

      if (!res.ok) { throw new Error(`Imagen API failed: ${res.statusText}`); }
      
      const result = await res.json();
      const base64Data = result?.predictions?.[0]?.bytesBase64Encoded;
      if (!base64Data) { throw new Error("Imagen API response did not contain image data."); }

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          imageUrl: `data:image/png;base64,${base64Data}`,
          prompt: generatedImagePrompt 
        })
      };
    }

    // --- 2b. Handle TTS Generation (Gemini TTS) ---
    if (feature === 'tts') {
      if (!textToSpeak) { return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Missing required "textToSpeak" data for TTS.' }) }; }

      const TTS_MODEL = "gemini-2.5-flash-preview-tts";
      const TTS_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
      const ttsPayload = {
        contents: [{ parts: [{ text: textToSpeak }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice || "Puck" } } }
        },
        model: TTS_MODEL
      };

      const res = await fetchWithRetry(TTS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ttsPayload)
      });
      
      if (!res.ok) { throw new Error(`TTS API failed: ${res.statusText}`); }
      
      const result = await res.json();
      const part = result?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      const audioData = part?.data;
      const mimeType = part?.mimeType;
      
      if (!audioData || !mimeType) { throw new Error("TTS API response did not contain audio data."); }

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ audioData: audioData, mimeType: mimeType })
      };
    }

    // --- 2c. Handle Text Generation (Gemini Flash) ---
    if (TEXT_GENERATION_FEATURES.includes(feature)) {
      if (!userGoal) { return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Missing required userGoal data for feature.' }) }; }

      const TEXT_MODEL = "gemini-2.5-flash-preview-09-2025"; 
      const TEXT_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
      const systemInstructionText = SYSTEM_INSTRUCTIONS[feature];
      const payload = {
        contents: [{ parts: [{ text: userGoal }] }],
        systemInstruction: { parts: [{ text: systemInstructionText }] },
        generationConfig: { temperature: 0.7 }
      };

      const isJsonFeature = feature === 'smart_goal_structuring' || feature === 'dream_energy_analysis';

      if (isJsonFeature) {
        payload.generationConfig.temperature = 0.2; 
        payload.generationConfig.responseMimeType = "application/json";
        payload.generationConfig.responseSchema = (feature === 'smart_goal_structuring') ? SMART_GOAL_SCHEMA : DREAM_ENERGY_SCHEMA;
      } else {
        // Only use Google Search grounding for non-JSON, text-based features (plan, obstacle_analysis, etc.)
        payload.tools = [{ googleSearch: {} }];
      }

      const res = await fetchWithRetry(TEXT_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await res.json();
      
      if (!res.ok) { throw new Error(`Gemini API error: ${JSON.stringify(result)}`); }

      const responseContent = result.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!responseContent) {
        console.error("Gemini API Response Missing Content:", JSON.stringify(result));
        throw new Error(`AI generation failed for ${feature}: response was empty.`);
      }

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ text: responseContent })
      };
    }

    // --- Default Case ---
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ message: `Invalid "operation/action" specified: ${feature}.` })
    };

  } catch (error) {
    console.error("Internal handler error:", error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ message: `Internal server error: ${error.message}` })
    };
  }
};
