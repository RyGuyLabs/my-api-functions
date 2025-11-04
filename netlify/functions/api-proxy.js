/**
 * Netlify Function: api-proxy.js
 * Handles AI Generation for the Dream Planner App:
 * 1. AI GENERATION: Text (Gemini), Image (Imagen), TTS (Gemini).
 *
 * This function is now streamlined to ONLY handle AI calls,
 * as the frontend handles Firestore data operations directly.
 */

const fetch = require('node-fetch').default;

// --- ENV VARIABLES ---
const GEMINI_API_KEY = process.env.FIRST_API_KEY; // Used for all Google AI calls (Gemini, Imagen, TTS)

// --- FEATURE GROUPS ---
const TEXT_GENERATION_FEATURES = [
  "plan", "pep_talk", "obstacle_analysis",
  "positive_spin", "mindset_reset", "objection_handler",
  "smart_goal_structuring", "dream_energy_analysis"
];

// --- SMART GOAL SCHEMA (Matches frontend) ---
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

// --- DREAM ENERGY SCHEMA (NEW - Matches frontend 'updateEnergyDisplay') ---
const DREAM_ENERGY_SCHEMA = {
  type: "OBJECT",
  properties: {
    confidence: { type: "INTEGER", description: "The user's likely confidence score for this goal, 0-100." },
    consistency: { type: "INTEGER", description: "The user's likely consistency score for this goal, 0-100." },
    creativity: { type: "INTEGER", description: "The creativity and novelty score of this goal, 0-100." },
    actionableInsight: { type: "STRING", description: "A single, short, actionable insight based on these scores." }
  },
  required: ["confidence", "consistency", "creativity", "actionableInsight"]
};

// --- SYSTEM INSTRUCTIONS (Updated) ---
const SYSTEM_INSTRUCTIONS = {
  "plan": "You are an expert project manager and motivator. Your sole task is to take the user's goal and break it down into a highly actionable, time-bound, 5-step strategic plan. Write in a clear, supportive, and professional tone. Respond with a motivating introductory paragraph followed by the five steps in a numbered list.",
  "pep_talk": "You are RyGuy, a masculine, inspiring, and direct motivational coach. Provide an intense, high-energy pep talk to the user about why their goal is achievable and why they must start now. Use bold text liberally for impact and keep the response concise and powerful, around 4-5 sentences.",
  "vision_prompt": "You are a creative visual artist. Take the user's goal and transform it into a highly detailed, cinematic, and descriptive prompt for an image generator (like Imagen). The prompt must emphasize style, lighting, setting, emotion, and aesthetic details (e.g., 'hyper-detailed, dramatic lighting, 8K, cinematic contrast'). The output must ONLY be the image prompt string, no other text or explanation.",
  "obstacle_analysis": "You are a strategic consultant named RyGuy. Analyze the user's goal and identify the three most likely internal and external obstacles they will face. For each obstacle, provide a concrete, 1-2 sentence counter-strategy. Format the output using markdown headers for clarity.",
  "positive_spin": "You are an optimistic reframer named RyGuy. Take the user's goal and rephrase it into three distinct, highly positive, and empowering affirmations. Each affirmation should be a standalone sentence and focus on the identity the user is becoming, not just the action they are taking. Use a confident tone.",
  "mindset_reset": "You are a pragmatic mindset coach named RyGuy. Provide a short, structured script for the user to perform a 60-second mental reset. The script must contain three steps: Acknowledge the Fear, Re-center on the Why, and Take the Next Small Action. Use numbered steps.",
  "objection_handler": "You are a professional sales trainer named RyGuy. Identify three common internal objections (e.g., 'I don't have time', 'I'm not good enough') that might sabotage the user's goal. For each objection, provide a single, powerful, pre-written counter-statement the user can say to themselves to overcome it. Use a confident, firm tone.",
  "smart_goal_structuring": "You are a professional goal-setting consultant. Your sole instruction is to structure the user's goal into the SMART framework and return the result STRICTLY as a JSON object that adheres to the provided schema. Do not include any introductory text, markdown fences, or explanations outside of the final JSON.",
  "dream_energy_analysis": "You are the 'Energy Flow Specialist'. Analyze the user's goal for confidence, consistency, and creativity on a scale of 0-100. Provide a single, short, actionable insight based on these scores. You MUST return ONLY a JSON object adhering to the provided schema."
};

// --- CORS HEADERS ---
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

// --- HELPER: Fetch with Exponential Backoff ---
async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok || (response.status >= 400 && response.status < 500 && response.status !== 429)) return response;
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

// --- NETLIFY HANDLER ---
exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ message: "Method Not Allowed" }) };

  if (!GEMINI_API_KEY) return {
    statusCode: 500,
    headers: CORS_HEADERS,
    body: JSON.stringify({ message: 'Missing API key in environment variables.' })
  };

  try {
    const body = JSON.parse(event.body);
    const feature = body.action;
    const { userGoal, text, voice } = body;

    if (!feature) return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: "Missing required 'action'." }) };

    // --- ROUTE 1: IMAGE GENERATION (Triggered by 'vision_prompt') ---
    if (feature === 'vision_prompt') {
      if (!userGoal) return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Missing userGoal for image prompt.' }) };

      // 1. Generate the vision prompt text first
      const PROMPT_MODEL = "gemini-2.5-flash"; 
      const PROMPT_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${PROMPT_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
      const promptPayload = {
        contents: [{ parts: [{ text: userGoal }] }],
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTIONS["vision_prompt"] }] },
        generationConfig: { temperature: 0.8 }
      };

      const promptRes = await fetchWithRetry(PROMPT_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(promptPayload) });
      const promptResult = await promptRes.json();
      if (!promptRes.ok) throw new Error(`Gemini prompt generation error: ${JSON.stringify(promptResult)}`);
      
      const imagePrompt = promptResult?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!imagePrompt) throw new Error("Image prompt generation failed.");

      // 2. Generate the image using the new prompt
      const IMAGEN_MODEL = "imagen-3.0-generate-002";
      const IMAGEN_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGEN_MODEL}:predict?key=${GEMINI_API_KEY}`;
      const imagePayload = { instances: [{ prompt: imagePrompt }], parameters: { sampleCount: 1, aspectRatio: "1:1", outputMimeType: "image/png" } };

      const imgRes = await fetchWithRetry(IMAGEN_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(imagePayload) });
      const imgResult = await imgRes.json();
      if (!imgRes.ok) throw new Error(`Imagen API error: ${JSON.stringify(imgResult)}`);

      const base64Data = imgResult?.predictions?.[0]?.bytesBase64Encoded;
      if (!base64Data) throw new Error("Image generation failed to return data.");

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          imageUrl: `data:image/png;base64,${base64Data}`,
          prompt: imagePrompt
        })
      };
    }

    // --- ROUTE 2: TTS GENERATION ---
    if (feature === 'tts') {
      if (!text) return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Missing text for TTS.' }) };
      
      const TTS_MODEL = "gemini-2.5-flash-preview-tts"; 
      const TTS_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
      const ttsPayload = {
        contents: [{ parts: [{ text: text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice || "Fenrir" } 
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

    // --- ROUTE 3: TEXT & JSON GENERATION ---
    if (TEXT_GENERATION_FEATURES.includes(feature)) {
      if (!userGoal) return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Missing userGoal.' }) };

      const TEXT_MODEL = "gemini-2.5-pro"; 
      const TEXT_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

      const payload = {
        contents: [{ parts: [{ text: userGoal }] }],
        generationConfig: {
          temperature: 0.7, // Default temperature
        }
      };

      // *** FIX AHEAD ***
      // Apply correct config based on feature type
      if (feature === 'smart_goal_structuring' || feature === 'dream_energy_analysis') {
        // This is a JSON feature.
        // DO NOT ADD 'tools'.
        // Add JSON-specific config.
        payload.generationConfig.temperature = 0.2; // Lower temp for factual JSON
        payload.generationConfig.responseMimeType = "application/json";
        payload.generationConfig.responseSchema = (feature === 'smart_goal_structuring') ? SMART_GOAL_SCHEMA : DREAM_ENERGY_SCHEMA;
        payload.systemInstruction = { parts: [{ text: SYSTEM_INSTRUCTIONS[feature] }] };
      } else {
        // This is a standard text feature.
        // ADD 'tools' for Google Search grounding.
        // DO NOT ADD 'responseMimeType'.
        payload.tools = [{ googleSearch: {} }];
        payload.systemInstruction = { parts: [{ text: SYSTEM_INSTRUCTIONS[feature] }] };
      }
      // *** END FIX ***

      const res = await fetchWithRetry(TEXT_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await res.json();
      
      if (!res.ok) {
          // Throw the specific error message from Gemini
          throw new Error(`Gemini API error: ${JSON.stringify(result)}`);
      }

      const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) throw new Error("Text generation failed: empty response.");

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ text: rawText }) // Client expects { text: "..." }
      };
    }

    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: `Invalid action: ${feature}` }) };

  } catch (err) {
    console.error(err); // Log the full error to Netlify console
    // Return the specific error message to the client
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ message: `Internal server error: ${err.message}` }) };
  }
};
