const { GoogleGenerativeAI } = require("@google/generative-ai");
const Ajv = require("ajv");
const ajv = new Ajv();
const crypto = require("crypto");

// Consistent CORS headers for all responses.
// In production, this should be scoped to your domain(s).
const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
};

const geminiApiKey = process.env.FIRST_API_KEY;

// Define the canonical fallback response as a single source of truth
const FALLBACK_RESPONSE = {
    report: "<p>Error: The AI could not generate a valid report. Please try again.</p>",
    predictive: "",
    outreach: "",
    questions: "",
    news: ""
};

// Define the schema for the expected JSON response
const responseSchema = {
    type: "object",
    properties: {
        report: { type: "string", minLength: 0 },
        predictive: { type: "string", minLength: 0 },
        outreach: { type: "string", minLength: 0 },
        questions: { type: "string", minLength: 0 },
        news: { type: "string", minLength: 0 }
    },
    required: ["report", "predictive", "outreach", "questions", "news"],
    // Be resilient to additional properties that Gemini might include
    additionalProperties: true
};
const validate = ajv.compile(responseSchema);

// Factory function for generating a consistent fallback response
function fallbackResponse(message, rawAIResponse, errors = null, extraFields = null) {
    const isDevelopment = process.env.NODE_ENV === "development";

    const response = { ...FALLBACK_RESPONSE };
    response.report = `<p>Error: ${message}</p>`;

    if (isDevelopment) {
        response.debug = {
            rawResponse: rawAIResponse,
            validationErrors: errors,
            message: message,
            extraFields: extraFields,
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
            // Log abort errors explicitly for clarity
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

// Correctly handle the Google Search Tool Function
async function googleSearch(query) {
    const searchApiKey = process.env.RYGUY_SEARCH_API_KEY;
    const searchEngineId = process.env.RYGUY_SEARCH_ENGINE_ID;
    
    if (!searchApiKey || !searchEngineId) {
        console.error("[LeadQualifier] Missing Google Search API credentials.");
        return { error: "Search credentials missing." };
    }

    const url = `https://www.googleapis.com/customsearch/v1?key=${searchApiKey}&cx=${searchEngineId}&q=${encodeURIComponent(query)}`;
    
    try {
        const maxRetries = parseInt(process.env.GOOGLE_MAX_RETRIES, 10) || 3;
        const response = await retryWithTimeout(async (signal) => {
            const res = await fetch(url, { signal });
            if (res.status === 429) {
                // Short-circuit retries on a specific quota error
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
            return { message: "No results found." };
        }
        return data.items.map(item => ({
            title: item.title,
            link: item.link,
            snippet: item.snippet
        }));
    } catch (error) {
        console.error("[LeadQualifier] Google Search error after all retries:", error);
        return { error: `All Google Search attempts failed. ${error.message}` };
    }
}

// New helper function to safely extract text from the Gemini response
function extractText(resp) {
  const parts = resp.candidates?.flatMap(candidate => 
      candidate.content?.parts?.filter(part => part.text) || []
  );
  // This is a safer way to get the text that avoids a potential Promise issue.
  return parts?.map(part => part.text).filter(Boolean).join('') || "";
}

// Helper function to generate the prompt content from data
function createPrompt(leadData, idealClient) {
    // The JSON.stringify call safely escapes special characters
    return `Generate a professional sales report as a single JSON object with the following keys: "report", "predictive", "outreach", "questions", and "news".
            
    Based on the following data:
    Lead Data: ${JSON.stringify(leadData)}
    Ideal Client Profile: ${JSON.stringify(idealClient || {})}
            
    Use the 'googleSearch' tool for relevant, up-to-date information, especially for the 'news' key. The googleSearch tool will return a JSON array of objects. Use the "title", "link", and "snippet" from each object to create a well-formatted HTML output for the "news" key.
    If you are unable to generate a valid JSON response for any reason, return the following JSON object exactly:
    ${JSON.stringify(FALLBACK_RESPONSE)}
            
    Do not include any conversational text or explanation outside of the JSON object.`;
}

// A map of error messages for a single source of truth
const ERROR_MESSAGES = {
    'empty response': "AI returned an empty response. Please check API key permissions.",
    'validation failed': "Schema validation failed. AI provided an unexpected JSON structure.",
    'JSON': "JSON parsing failed. AI provided an invalid JSON response.",
    'fetch failed': "Network error during API call. Please check your connection or try again.",
    'quota': "Google Search quota exceeded. Try again later."
};

exports.handler = async (event) => {
    const requestId = crypto.randomUUID();
    
    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 204, headers: CORS_HEADERS };
    }
    
    if (event.httpMethod !== "POST") {
        return { 
            statusCode: 405, 
            headers: { ...CORS_HEADERS, "Content-Type": "application/json", "Accept": "application/json" }, 
            body: JSON.stringify({ error: "Method Not Allowed" }) 
        };
    }

    try {
        const { leadData, idealClient } = JSON.parse(event.body);
        
        if (!leadData || Object.keys(leadData).length === 0) {
            return { 
                statusCode: 400, 
                headers: { ...CORS_HEADERS, "Content-Type": "application/json", "Accept": "application/json" }, 
                body: JSON.stringify({ error: "Missing leadData in request body." }) 
            };
        }

        // Check to ensure the API key is available and valid
        const isDevelopment = process.env.NODE_ENV === "development";
        
        if (!geminiApiKey || geminiApiKey.length < 10) {
            console.error(`[LeadQualifier] Request ID: ${requestId} - Gemini API key is missing or too short. Please check environment variables.`);
            return {
                statusCode: 500,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json", "Accept": "application/json" },
                body: JSON.stringify(fallbackResponse("Server configuration error: Gemini API key is missing or invalid."))
            };
        }
		
		const genAI = new GoogleGenerativeAI(geminiApiKey);

        const model = genAI.getGenerativeModel({
            // Use a stable, supported model directly
            model: "gemini-1.5-pro",
            // Explicitly define safety settings for predictable production behavior
            // Using only valid categories
            safetySettings: [
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                // Block unspecified categories to prevent unexpected blocking
                { category: "HARM_CATEGORY_UNSPECIFIED", threshold: "BLOCK_NONE" }
            ],
            // Use generationConfig to enforce JSON output and avoid fragile parsing
            generationConfig: {
                responseMimeType: "application/json",
                // Set maxOutputTokens to keep the response size predictable
                maxOutputTokens: 2048
            },
            tools: [{
                functionDeclarations: [{
                    name: "googleSearch",
                    description: "Search Google for up-to-date lead or industry information.",
                    parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
                }]
            }]
        });
        
        const promptContent = createPrompt(leadData, idealClient);

        let parsedData = {};
        let rawAIResponse = "";
        let extraFields = null;

        try {
            const maxRetries = parseInt(process.env.GEMINI_MAX_RETRIES, 10) || 2;
            const timeoutMs = parseInt(process.env.GEMINI_TIMEOUT_MS, 10) || 10000;
            const response = await retryWithTimeout(async (signal) => {
                const chat = model.startChat({ history: [] });
                const result = await chat.sendMessage(promptContent, {
                    signal,
                    toolResponseHandler: async (toolCall) => {
                        if (toolCall.name === "googleSearch") {
                            const searchResults = await googleSearch(toolCall.args.query);
                            if (searchResults.error) {
                                return { 
                                    functionResponse: {
                                        name: toolCall.name,
                                        response: { results: [], error: searchResults.error }
                                    }
                                };
                            }
                            return { 
                                functionResponse: {
                                    name: toolCall.name,
                                    response: { results: searchResults, error: null }
                                }
                            };
                        } else {
                            console.warn(`[LeadQualifier] Request ID: ${requestId} - Unrecognized function call: ${toolCall.name}`);
                            return { output: "Unrecognized function." };
                        }
                    }
                });
                return extractText(result);
            }, maxRetries, timeoutMs);

            rawAIResponse = response;
            
            if (!rawAIResponse) {
                throw new Error("API returned an empty response after retries.");
            }
            
            parsedData = JSON.parse(rawAIResponse);
            
            const expectedKeys = Object.keys(responseSchema.properties);
            
            // Filter extra fields and capture them for debugging
            extraFields = Object.keys(parsedData).filter(key => !expectedKeys.includes(key));
            if (extraFields.length > 0 && isDevelopment) {
                console.warn(`[LeadQualifier] Request ID: ${requestId} - Unexpected extra fields from Gemini:`, extraFields);
            }
            
            parsedData = Object.fromEntries(
                Object.entries(parsedData).filter(([key]) => expectedKeys.includes(key))
            );

            if (!validate(parsedData)) {
                // If validation fails, merge valid parsed data with the fallback to salvage partial success
                console.error(`[LeadQualifier] Request ID: ${requestId} - Schema validation failed: ${ajv.errorsText(validate.errors)}`);
                parsedData = { ...FALLBACK_RESPONSE, ...parsedData };
            }
        } catch (jsonError) {
            console.error(`[LeadQualifier] Request ID: ${requestId} - Response processing failed: ${jsonError.message}`, { rawAIResponse, stack: jsonError.stack });
            
            let errorMessage = "Could not generate a valid report.";
            const matchedKey = Object.keys(ERROR_MESSAGES).find(key => jsonError.message.includes(key) || jsonError.name === "AbortError" || jsonError.message === "Failed to fetch");
            if (matchedKey) {
                errorMessage = ERROR_MESSAGES[matchedKey];
            }

            parsedData = fallbackResponse(errorMessage, rawAIResponse, validate.errors, extraFields);
        }

        return { 
            statusCode: 200, 
            headers: { ...CORS_HEADERS, "Content-Type": "application/json", "Accept": "application/json" }, 
            body: JSON.stringify({
                ...parsedData,
                debug: { rawAIResponse, extraFields }
            }) 
        };

    } catch (error) {
        console.error(`[LeadQualifier] Request ID: ${requestId} - Function error: ${error.message}`, { stack: error.stack });
        const fallback = fallbackResponse("AI report generation failed. Please retry shortly.");
        return { 
            statusCode: 500, 
            headers: { ...CORS_HEADERS, "Content-Type": "application/json", "Accept": "application/json" }, 
            body: JSON.stringify(fallback) 
        };
    }
};
