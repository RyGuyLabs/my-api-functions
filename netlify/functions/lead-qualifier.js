const { GoogleGenerativeAI } = require("@google/generative-ai");
const fetch = require("node-fetch");
const Ajv = require("ajv");
const crypto = require("crypto");

const ajv = new Ajv();

// --- CORS headers ---
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const geminiApiKey = process.env.FIRST_API_KEY;

// --- Canonical fallback response ---
const FALLBACK_RESPONSE = {
  report: "<p>Error: The AI could not generate a valid report. Please try again.</p>",
  predictive: "",
  outreach: "",
  questions: "",
  news: ""
};

// --- Schema for AI response ---
const responseSchema = {
  type: "object",
  properties: {
    report: { type: "string" },
    predictive: { type: "string" },
    outreach: { type: "string" },
    questions: { type: "string" },
    news: { type: "string" }
  },
  required: ["report", "predictive", "outreach", "questions", "news"],
  additionalProperties: true
};
const validate = ajv.compile(responseSchema);

// --- Fallback response factory ---
function fallbackResponse(message, rawAIResponse, errors = null, extraFields = null) {
  const isDevelopment = process.env.NODE_ENV === "development";
  const response = { ...FALLBACK_RESPONSE, report: `<p>Error: ${message}</p>` };

  if (isDevelopment) {
    response.debug = { rawResponse: rawAIResponse, validationErrors: errors, extraFields };
  }
  return response;
}

// --- Retry helper with timeout ---
async function retryWithTimeout(fn, maxRetries = 2, timeoutMs = 10000) {
  let attempt = 0;
  while (attempt <= maxRetries) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fn(controller.signal);
    } catch (err) {
      if ((err.name === "AbortError" || err.retriable) && attempt < maxRetries) {
        attempt++;
        await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt - 1)));
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}

// --- Google Search helper ---
async function googleSearch(query) {
  const searchApiKey = process.env.RYGUY_SEARCH_API_KEY;
  const searchEngineId = process.env.RYGUY_SEARCH_ENGINE_ID;

  if (!searchApiKey || !searchEngineId) {
    return { error: "Search credentials missing." };
  }

  const url = `https://www.googleapis.com/customsearch/v1?key=${searchApiKey}&cx=${searchEngineId}&q=${encodeURIComponent(query)}`;

  try {
    const response = await retryWithTimeout(async (signal) => {
      const res = await fetch(url, { signal });
      if (!res.ok) {
        const error = new Error(`Google Search failed: ${res.status}`);
        error.retriable = res.status >= 500;
        throw error;
      }
      return res;
    }, 2, 5000);

    const data = await response.json();
    if (!data.items?.length) return { message: "No results found." };

    return data.items.map(item => ({
      title: item.title,
      link: item.link,
      snippet: item.snippet
    }));
  } catch (err) {
    return { error: `Google Search failed: ${err.message}` };
  }
}

// --- Prompt builder ---
function createPrompt(leadData, idealClient) {
  return `Generate a professional sales report as a single JSON object with keys: "report", "predictive", "outreach", "questions", and "news".

Lead Data: ${JSON.stringify(leadData)}
Ideal Client Profile: ${JSON.stringify(idealClient || {})}

Use the 'googleSearch' tool for up-to-date information, especially for 'news'.
If you cannot generate valid JSON, return exactly:
${JSON.stringify(FALLBACK_RESPONSE)}

Only output valid JSON, no explanations.`;
}

// --- Error Messages ---
const ERROR_MESSAGES = {
  "empty response": "AI returned an empty response.",
  "validation failed": "Schema validation failed.",
  "JSON": "JSON parsing failed.",
  "fetch failed": "Network error during API call."
};

// --- Netlify Handler ---
exports.handler = async (event) => {
  const requestId = crypto.randomUUID();

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  try {
    const { leadData, idealClient } = JSON.parse(event.body);
    if (!leadData || Object.keys(leadData).length === 0) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "Missing leadData." }) };
    }

    if (!geminiApiKey || geminiApiKey.length < 10) {
      return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify(fallbackResponse("Server misconfigured: Gemini API key missing.")) };
    }

    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-pro",
      safetySettings: [
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }
      ],
      generationConfig: { responseMimeType: "application/json", maxOutputTokens: 2048 },
      tools: [{
        functionDeclarations: [{
          name: "googleSearch",
          description: "Search Google for up-to-date lead or industry information.",
          parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] }
        }]
      }]
    });

    const prompt = createPrompt(leadData, idealClient);

    let parsedData = {};
    let rawAIResponse = "";

    try {
      const result = await retryWithTimeout(async (signal) => {
        const chat = model.startChat({ history: [] });
        const response = await chat.sendMessage(prompt, {
          signal,
          toolResponseHandler: async (toolCall) => {
            if (toolCall.name === "googleSearch") {
              const results = await googleSearch(toolCall.args.query);
              return { functionResponse: { name: toolCall.name, response: results } };
            }
            return { output: "Unrecognized tool." };
          }
        });

        // Combine all text parts safely
        const textParts = response.candidates?.flatMap(c => c.content?.parts?.map(p => p.text)) || [];
        return textParts.join("");
      });

      rawAIResponse = result;
      parsedData = JSON.parse(rawAIResponse);

      if (!validate(parsedData)) throw new Error("validation failed");
    } catch (err) {
      const key = Object.keys(ERROR_MESSAGES).find(k => err.message.includes(k)) || "JSON";
      parsedData = fallbackResponse(ERROR_MESSAGES[key], rawAIResponse, validate.errors);
    }

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(parsedData) };

  } catch (err) {
    const fallback = fallbackResponse("AI report generation failed.");
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify(fallback) };
  }
};
