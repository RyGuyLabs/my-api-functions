// netlify/functions/lead-qualifier.js
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fetch = require("node-fetch");
const crypto = require("crypto");

// Consistent CORS headers for all responses. This is critical for cross-origin requests.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const geminiApiKey = process.env.FIRST_API_KEY || process.env.GEMINI_API_KEY;

// Define the canonical fallback response as a single source of truth
const FALLBACK_RESPONSE = {
  report: "",
  predictive: "",
  outreach: "",
  questions: [],
  news: []
};

// Define the required keys for the JSON response
const REQUIRED_RESPONSE_KEYS = ["report", "predictive", "outreach", "questions", "news"];

// Factory function for generating a consistent fallback response
function fallbackResponse(message, rawAIResponse, extraFields = null) {
  const isDevelopment = process.env.NODE_ENV === "development";

  const response = { ...FALLBACK_RESPONSE };
  response.report = `<p>Error: ${message}</p>`;

  if (isDevelopment) {
    response.debug = {
      rawResponse: rawAIResponse,
      message,
      extraFields,
    };
  }
  return response;
}

// A generic helper function to handle retries with exponential backoff and timeout
async function retryWithTimeout(fn, maxRetries = 2, timeoutMs = 10000) {
  let attempt = 0;
  while (attempt <= maxRetries) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const result = await fn(controller.signal);
      return result;
    } catch (err) {
      if (err.name === "AbortError") {
        console.warn(`[LeadQualifier] Request timed out. (Attempt ${attempt + 1}/${maxRetries + 1})`);
      }
      if ((err.name === "AbortError" || err.retriable) && attempt < maxRetries) {
        attempt++;
        console.warn(`[LeadQualifier] Fetch failed, retrying... (Attempt ${attempt}/${maxRetries})`);
        await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt - 1)));
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}

// Correctly handle the Google Search wrapper
async function googleSearch(query) {
  const searchApiKey = process.env.RYGUY_SEARCH_API_KEY;
  const searchEngineId = process.env.RYGUY_SEARCH_ENGINE_ID;

  if (!searchApiKey || !searchEngineId) {
    console.error("[LeadQualifier] Missing Google Search API credentials.");
    return { results: [], error: "Search credentials missing." };
  }

  const url = `https://www.googleapis.com/customsearch/v1?key=${searchApiKey}&cx=${searchEngineId}&q=${encodeURIComponent(query)}`;

  try {
    const maxRetries = parseInt(process.env.GOOGLE_MAX_RETRIES, 10) || 3;
    const response = await retryWithTimeout(async (signal) => {
      const res = await fetch(url, { signal });
      if (res.status === 429) {
        const error = new Error("Google Search quota exceeded.");
        error.retriable = false;
        throw error;
      }
      if (!res.ok) {
        const error = new Error(`Google Search failed with status: ${res.status}`);
        error.retriable = res.status >= 500 && res.status < 600;
        throw error;
      }
      return res;
    }, maxRetries, 5000);

    const data = await response.json();
    if (!data.items || !data.items.length) {
      return { results: [], message: "No results found." };
    }
    return {
      results: data.items.map(item => ({
        title: item.title,
        link: item.link,
        snippet: item.snippet // still available here if you ever want it
      }))
    };
  } catch (error) {
    console.error("[LeadQualifier] Google Search error after all retries:", error);
    return { results: [], error: `All Google Search attempts failed. ${error.message}` };
  }
}

// Helper function to safely extract text from the Gemini response
function extractText(resp) {
  // Accept either the response object or the nested response
  const candidates = resp?.candidates || resp?.response?.candidates || [];
  const parts = candidates.flatMap(candidate => (candidate.content?.parts || []).filter(p => p.text));
  return parts.map(p => p.text).join('') || "";
}

// Helper function to generate the prompt content from data
function createPrompt(leadData, idealClient) {
  return `You are a seasoned sales consultant specializing in strategic lead qualification. Your goal is to generate a comprehensive, actionable, and highly personalized sales report for an account executive. Your output MUST be a single JSON object with the following keys: "report", "predictive", "outreach", "questions", and "news".

**Instructions for Tone and Quality:**
* **Strategic & Insightful:** The report should demonstrate a deep, nuanced understanding of the lead's business, industry trends, and potential challenges.
* **Memorable & Impactful:** Frame the lead's profile in a compelling narrative that highlights their unique potential and the specific value our solution can provide.
* **Friendly & Resonating:** Use a warm, human tone, especially in the predictive and outreach sections, to build rapport and trust.

**Instructions for Each Key:**
* **"report":** A comprehensive, one-paragraph strategic summary. Frame the key opportunity and explain the "why" behind the analysis. Connect the dots between the lead's data, ideal client profile, and any relevant search findings.
* **"predictive":** A strategic plan with in-depth and elaborate insights. Start with a 1-2 sentence empathetic and intelligent prediction about the lead's future needs or challenges, and then use a bulleted list to detail a strategy for communicating with them.
* **"outreach":** A professional, friendly, and highly personalized outreach message formatted as a plan with appropriate line breaks for easy copy-pasting. Use "\\n" to create line breaks for new paragraphs.
* **"questions":** A list of 3-5 thought-provoking, open-ended questions formatted as a bulleted list. The questions should be designed to validate your assumptions and guide a productive, two-way conversation with the lead. Do not add a comma after the question mark.
* **"news":** An empty JSON array `[]`. The system will populate this with real search results after you are done. Do not include any extra text.

**Data for Analysis:**
* **Lead Data:** ${JSON.stringify(leadData)}
* **Ideal Client Profile:** ${JSON.stringify(idealClient || {})}

Use the 'googleSearch' tool to find relevant, up-to-date information, particularly for the 'news' key.
Do not include any conversational text or explanation outside of the JSON object.`;
}

// Helper function to consistently return a response object with headers.
function createResponse(statusCode, body) {
  return {
    statusCode,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

// Run the one-off API key test once per cold start (non-blocking)
let geminiKeyTested = false;
(async function runColdStartTest() {
  if (geminiKeyTested) return;
  geminiKeyTested = true;
  if (!geminiApiKey || geminiApiKey.length < 10) {
    console.warn("[LeadQualifier] Gemini API key missing or too short — skipping cold-start test.");
    return;
  }
  try {
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    // Non-blocking test call — do not await inside request handling
    model.generateContent({ contents: [{ role: "user", parts: [{ text: "Health check" }] }] })
      .then(res => {
        const txt = extractText(res.response);
        console.log(`[LeadQualifier] Cold-start key test result: ${txt ? "OK" : "EMPTY"}`);
      })
      .catch(err => {
        console.warn("[LeadQualifier] Cold-start key test failed:", err.message || err);
      });
  } catch (err) {
    console.warn("[LeadQualifier] Cold-start key test exception:", err.message || err);
  }
})();

exports.handler = async (event) => {
  try {
    const requestId = crypto.randomUUID();

    // Handle preflight early (guaranteed CORS headers)
    if (event.httpMethod === "OPTIONS") {
      return { statusCode: 204, headers: CORS_HEADERS };
    }

    if (event.httpMethod !== "POST") {
      return createResponse(405, { error: "Method Not Allowed" });
    }

    // Parse body robustly
    let parsedBody;
    try {
      parsedBody = JSON.parse(event.body || "{}");
    } catch (parseErr) {
      return createResponse(400, { error: "Invalid JSON request body." });
    }

    // Accept either { leadData, idealClient } or a raw leadData payload
    const leadData = parsedBody.leadData || parsedBody;
    const idealClient = parsedBody.idealClient || {};

    if (!leadData || Object.keys(leadData).length === 0) {
      return createResponse(400, { error: "Missing leadData in request body." });
    }

    if (!geminiApiKey || geminiApiKey.length < 10) {
      console.error(`[LeadQualifier] Request ID: ${requestId} - Gemini API key is missing or invalid.`);
      return createResponse(500, fallbackResponse("Server configuration error: Gemini API key is missing or invalid."));
    }

    const genAI = new GoogleGenerativeAI(geminiApiKey);

    // Use the model to produce structured JSON (news left empty intentionally)
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-pro",
      generationConfig: {
        responseMimeType: "application/json",
        maxOutputTokens: 2048
      },
      // You can keep functionDeclarations here if you ever want the model to call tools;
      // we will, however, populate `news` ourselves after parsing.
      tools: [{
        functionDeclarations: [{
          name: "googleSearch",
          description: "Search Google for up-to-date lead or industry information.",
          parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
        }]
      }]
    });

    const promptContent = createPrompt(leadData, idealClient);

    let result;
    try {
      result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: promptContent }] }]
      });
    } catch (genErr) {
      console.error(`[LeadQualifier] Request ID: ${requestId} - Model call failed:`, genErr);
      const fallback = fallbackResponse("AI report generation failed. Please retry shortly.");
      return createResponse(500, fallback);
    }

    // If the model attempted tool calls, handle them (multi-turn)
    // (This is safe even if the model didn't call any tools.)
    while (result.response.candidates?.[0]?.content?.parts?.some(p => p.functionCall)) {
      const toolCalls = result.response.candidates[0].content.parts.filter(p => p.functionCall);

      const toolResponses = await Promise.all(toolCalls.map(async (call) => {
        if (call.functionCall.name === "googleSearch") {
          const query = call.functionCall.args?.query || "";
          const searchResults = await googleSearch(query);
          return {
            functionResponse: {
              name: call.functionCall.name,
              response: searchResults
            }
          };
        }
        // Unknown tool: return empty response
        return {
          functionResponse: {
            name: call.functionCall.name,
            response: {}
          }
        };
      }));

      result = await model.generateContent({
        contents: [
          ...result.response.candidates[0].content.parts,
          ...toolResponses
        ]
      });
    }

    // Extract the text output (expected to be the JSON string)
    const responseText = extractText(result.response);

    if (!responseText) {
      console.error(`[LeadQualifier] Request ID: ${requestId} - AI returned an empty response.`);
      return createResponse(500, fallbackResponse("AI returned an empty response. This could be due to a safety filter or an API issue."));
    }

    // Try parsing JSON, with a simple cleanup fallback attempt
    let finalParsedData;
    try {
      finalParsedData = JSON.parse(responseText);
    } catch (jsonError) {
      console.warn(`[LeadQualifier] Request ID: ${requestId} - Primary JSON parse failed: ${jsonError.message}`);
      try {
        const cleaned = responseText.replace(/\\"/g, '"').replace(/\\n/g, '\n').trim();
        finalParsedData = JSON.parse(cleaned);
      } catch (secondErr) {
        console.error(`[LeadQualifier] Request ID: ${requestId} - JSON parsing failed: ${secondErr.message}`, { rawAIResponse: responseText });
        return createResponse(500, fallbackResponse("AI provided an invalid JSON response.", responseText));
      }
    }

    // Validate required keys
    const allKeysPresent = REQUIRED_RESPONSE_KEYS.every(key => Object.prototype.hasOwnProperty.call(finalParsedData, key));
    if (!allKeysPresent) {
      const missingKeys = REQUIRED_RESPONSE_KEYS.filter(key => !Object.prototype.hasOwnProperty.call(finalParsedData, key));
      console.error(`[LeadQualifier] Request ID: ${requestId} - Schema validation failed. Missing keys: ${missingKeys.join(', ')}`);
      const fallback = fallbackResponse("Schema validation failed. AI provided an unexpected JSON structure.", responseText, { missingKeys });
      return createResponse(500, fallback);
    }

    // --- Inject real news for every new lead ---
    const searchQuery = leadData.company || leadData.name || leadData.industry || "industry trends";
    let newsLinks = [];

    try {
      const searchResults = await googleSearch(searchQuery);
      if (searchResults.results && searchResults.results.length > 0) {
        newsLinks = searchResults.results.slice(0, 3).map(item => ({
          title: item.title,
          link: item.link
        }));
      } else {
        // If no results were returned, provide a placeholder link so UI can render gracefully
        newsLinks = [{ title: "No relevant news found", link: "#" }];
      }
    } catch (err) {
      console.error(`[LeadQualifier] Request ID: ${requestId} - News fetch failed: ${err.message}`);
      newsLinks = [{ title: "News temporarily unavailable", link: "#" }];
    }

    finalParsedData.news = newsLinks;

    // Return final object with CORS
    return createResponse(200, finalParsedData);

  } catch (error) {
    console.error(`[LeadQualifier] Function error: ${error.message}`, { stack: error.stack });
    const fallback = fallbackResponse(`An unknown error occurred on the server. Please check the Netlify function logs for more details.`);
    return createResponse(500, fallback);
  }
};
