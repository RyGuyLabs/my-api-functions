const { GoogleGenerativeAI } = require("@google/generative-ai");
const fetch = require("node-fetch");
const crypto = require("crypto");

// Consistent CORS headers for all responses.
const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
};

const geminiApiKey = process.env.FIRST_API_KEY;

// Define the canonical fallback response as a single source of truth
const FALLBACK_RESPONSE = {
    report: "",
    predictive: "",
    outreach: "",
    questions: "",
    news: ""
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

// Helper function to safely extract text from the Gemini response
function extractText(resp) {
  const parts = resp.candidates?.flatMap(candidate => 
      candidate.content?.parts?.filter(part => part.text) || []
  );
  return parts?.map(part => part.text).filter(Boolean).join('') || "";
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
    * **"news":** A professional and relevant news blurb based on the 'googleSearch' tool. This should be a single string containing a title (e.g., "Latest News") followed by 2-3 bullet points. Each bullet point should summarize a key finding and include a concise citation, with line breaks ("\\n\\n") separating each bullet point. Do not include raw URLs or objects, but a clean citation like "(Source: TechCrunch)".

    **Data for Analysis:**
    * **Lead Data:** ${JSON.stringify(leadData)}
    * **Ideal Client Profile:** ${JSON.stringify(idealClient || {})}
    
    Use the 'googleSearch' tool to find relevant, up-to-date information, particularly for the 'news' key.
    Do not include any conversational text or explanation outside of the JSON object.`;
}

// A map of error messages for a single source of truth
const ERROR_MESSAGES = {
    'empty response': "AI returned an empty response. Check for API key issues or content that violates safety settings.",
    'validation failed': "Schema validation failed. AI provided an unexpected JSON structure.",
    'JSON': "JSON parsing failed. AI provided an invalid JSON response.",
    'fetch failed': "Network error during API call. Please check your connection or try again.",
    'quota': "Google Search quota exceeded. Try again later."
};

exports.handler = async (event) => {
    const requestId = crypto.randomUUID();
    
    // START: Direct API Key Test
    try {
        if (!geminiApiKey || geminiApiKey.length < 10) {
            console.error(`[LeadQualifier] Request ID: ${requestId} - Direct Test: Gemini API key is missing or invalid.`);
        } else {
            const testGenAI = new GoogleGenerativeAI(geminiApiKey);
            const testModel = testGenAI.getGenerativeModel({ model: "gemini-1.5-pro" });
            const testResult = await testModel.generateContent("Test prompt to verify API key.");
            const testText = extractText(testResult.response);
            console.log(`[LeadQualifier] Request ID: ${requestId} - Direct Test Result: ${testText ? "SUCCESS" : "FAILURE (empty response)"}`);
        }
    } catch (testError) {
        console.error(`[LeadQualifier] Request ID: ${requestId} - Direct Test Error: ${testError.message}`);
    }
    // END: Direct API Key Test
    
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
            model: "gemini-1.5-pro",
            generationConfig: {
                responseMimeType: "application/json",
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

        try {
            const result = await model.generateContent({
                contents: [{ role: "user", parts: [{ text: promptContent }] }],
                toolResponseHandler: async (toolCall) => {
                    if (toolCall.name === "googleSearch") {
                        try {
                            const searchResults = await googleSearch(toolCall.args.query);
                            return { 
                                functionResponse: {
                                    name: toolCall.name,
                                    response: { results: searchResults, error: searchResults.error ? searchResults.error : null }
                                }
                            };
                        } catch (error) {
                            return { 
                                functionResponse: {
                                    name: toolCall.name,
                                    response: { results: [], error: error.message }
                                }
                            };
                        }
                    }
                }
            });
            
            const responseText = result.response.text();
            
            if (!responseText) {
                console.error(`[LeadQualifier] Request ID: ${requestId} - AI returned an empty response.`);
                return {
                    statusCode: 500,
                    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
                    body: JSON.stringify(fallbackResponse("AI returned an empty response. This could be due to a safety filter or an API issue."))
                };
            }

            let finalParsedData;
            try {
                finalParsedData = JSON.parse(responseText);
            } catch (jsonError) {
                console.error(`[LeadQualifier] Request ID: ${requestId} - JSON parsing failed: ${jsonError.message}`, { rawAIResponse: responseText });
                return {
                    statusCode: 500,
                    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
                    body: JSON.stringify(fallbackResponse("AI provided an invalid JSON response.", responseText))
                };
            }
            
            // Replaced AJV validation with a native JavaScript check
            const allKeysPresent = REQUIRED_RESPONSE_KEYS.every(key => Object.keys(finalParsedData).includes(key));
            
            if (!allKeysPresent) {
                const missingKeys = REQUIRED_RESPONSE_KEYS.filter(key => !Object.keys(finalParsedData).includes(key));
                console.error(`[LeadQualifier] Request ID: ${requestId} - Schema validation failed. Missing keys: ${missingKeys.join(', ')}`);
                const fallback = fallbackResponse("Schema validation failed. AI provided an unexpected JSON structure.", responseText, { missingKeys });
                return {
                    statusCode: 500,
                    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
                    body: JSON.stringify(fallback)
                };
            }

            return {
                statusCode: 200,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
                body: JSON.stringify(finalParsedData)
            };

        } catch (apiError) {
            console.error(`[LeadQualifier] Request ID: ${requestId} - API call failed: ${apiError.message}`, { stack: apiError.stack });
            const fallback = fallbackResponse("AI report generation failed. Please retry shortly.");
            return {
                statusCode: 500,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json", "Accept": "application/json" },
                body: JSON.stringify(fallback)
            };
        }

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

