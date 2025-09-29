const { GoogleGenerativeAI } = require("@google/generative-ai");
const crypto = require("crypto");

// Consistent CORS headers for all responses.
const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
};

// The function strictly uses the dedicated, isolated environment variable.
const geminiApiKey = process.env.LEAD_QUALIFIER_API_KEY;

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
    // Use a simple, readable error message for the front end
    response.report = `<p>Error: ${message}</p>`;

    if (isDevelopment) {
        // Include debug info only in development environments
        response.debug = {
            rawResponse: rawAIResponse,
            message: message,
            extraFields: extraFields,
        };
    }
    return response;
}

/**
 * A generic helper function to handle retries with exponential backoff and timeout
 * for any fetch-based API call (like the Custom Search API).
 */
async function retryWithTimeout(fn, maxRetries = 2, timeoutMs = 10000) {
    let attempt = 0;
    while (attempt <= maxRetries) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const result = await fn(controller.signal);
            return result;
        } catch (err) {
            // Log retries and apply backoff
            if (err.name === "AbortError" || err.retriable) {
                if (attempt < maxRetries) {
                    attempt++;
                    console.warn(`[LeadQualifier] Fetch failed, retrying... (Attempt ${attempt}/${maxRetries})`);
                    await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt - 1)));
                    continue;
                }
            }
            throw err; // Re-throw unretriable errors or after max retries
        } finally {
            clearTimeout(timeout);
        }
    }
}

/**
 * Executes a Google Custom Search API call using environment variables.
 * This function is used by the Gemini SDK's function calling mechanism.
 * @param {string} query The search query provided by the Gemini model.
 * @returns {Promise<Array<Object>|Object>} Array of results or an error object.
 */
async function googleSearch(query) {
    const searchApiKey = process.env.RYGUY_SEARCH_API_KEY;
    const searchEngineId = process.env.RYGUY_SEARCH_ENGINE_ID;
    
    if (!searchApiKey || !searchEngineId) {
        // Return an object with an 'error' key if credentials are missing.
        return { error: "Search credentials missing in environment." };
    }

    const url = `https://www.googleapis.com/customsearch/v1?key=${searchApiKey}&cx=${searchEngineId}&q=${encodeURIComponent(query)}`;
    
    try {
        const maxRetries = parseInt(process.env.GOOGLE_MAX_RETRIES, 10) || 3;
        
        const response = await retryWithTimeout(async (signal) => {
            const res = await fetch(url, { signal });
            
            if (res.status === 429) {
                const error = new Error("Google Search quota exceeded.");
                error.retriable = false; // Do not retry on quota error
                throw error;
            }
            if (!res.ok) {
                const error = new Error(`Google Search failed with status: ${res.status}`);
                error.retriable = res.status >= 500 && res.status < 600; // Retry on 5xx server errors
                throw error;
            }
            return res;
        }, maxRetries, 5000); // 5 second timeout for search API

        const data = await response.json();
        
        if (!data.items || !data.items.length) {
            return { message: "No relevant news results found." };
        }
        
        // Return only the necessary fields for the LLM
        return data.items.slice(0, 3).map(item => ({
            title: item.title,
            link: item.link,
            snippet: item.snippet
        }));
    } catch (error) {
        console.error("[LeadQualifier] Google Search error after all retries:", error);
        return { error: `All Google Search attempts failed. ${error.message}` };
    }
}

/**
 * Helper function to generate the comprehensive, structured prompt content.
 * @param {Object} leadData The incoming lead data.
 * @param {Object} idealClient The ideal client profile.
 * @returns {string} The full prompt string.
 */
function createPrompt(leadData, idealClient) {
    return `You are a seasoned sales consultant specializing in strategic lead qualification. Your goal is to generate a comprehensive, actionable, and highly personalized sales report for an account executive. Your output MUST be a single JSON object with the following keys: "report", "predictive", "outreach", "questions", and "news".

    **Instructions for Tone and Quality:**
    * **Strategic & Insightful:** The report should demonstrate a deep, nuanced understanding of the lead's business, industry trends, and potential challenges.
    * **Memorable & Impactful:** Frame the lead's profile in a compelling narrative that highlights their unique potential and the specific value our solution can provide.
    * **Friendly & Resonating:** Use a warm, human tone, especially in the predictive and outreach sections, to build rapport and trust.

    **Instructions for Each Key:**
    * **"report":** A comprehensive, one-paragraph strategic summary. Frame the key opportunity and explain the "why" behind the analysis. Connect the dots between the lead's data, ideal client profile, and any relevant search findings.
    * **"predictive":** A strategic plan with in-depth and elaborate insights. Start with a 1-2 sentence empathetic and intelligent prediction about the lead's future needs or challenges, and then use a bulleted list to detail a strategy for communicating with them.
    * **"outreach":** A professional, friendly, and highly personalized outreach message formatted as a plan with appropriate line breaks for easy copy-pasting. Use the markdown pattern for line breaks (two spaces at the end of a line) or just new lines in the string if necessary.
    * **"questions":** A list of 3-5 thought-provoking, open-ended questions formatted as a bulleted list (e.g., "* Question one"). The questions should be designed to validate your assumptions and guide a productive, two-way conversation with the lead. Do not add a comma after the question mark.
    * **"news":** A professional and relevant news blurb based on the 'googleSearch' tool. This must be formatted as a single string of **Markdown**. Include a brief title (e.g., "Latest News") followed by 2-3 concise bullet points. Each bullet point should summarize a key finding and include a clean citation, such as (Source: TechCrunch). Do not use raw URLs or attempt to use line break escapes (like \\n).

    **Data for Analysis:**
    * **Lead Data:** ${JSON.stringify(leadData)}
    * **Ideal Client Profile:** ${JSON.stringify(idealClient || {})}
    
    Use the 'googleSearch' tool to find relevant, up-to-date information, particularly for the 'news' key.
    Do not include any conversational text or explanation outside of the JSON object.`;
}

exports.handler = async (event) => {
    const requestId = crypto.randomUUID();
    
    // Handle CORS pre-flight request
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
            console.error(`[LeadQualifier] Request ID: ${requestId} - Dedicated LEAD_QUALIFIER_API_KEY is missing or too short.`);
            return {
                statusCode: 500,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json", "Accept": "application/json" },
                body: JSON.stringify(fallbackResponse("Server configuration error: The dedicated API key for this function is missing or invalid."))
            };
        }
        
        const genAI = new GoogleGenerativeAI(geminiApiKey);

        // Define the JSON schema for the required output structure
        const responseSchema = {
            type: "OBJECT",
            properties: {
                report: { type: "STRING" },
                predictive: { type: "STRING" },
                outreach: { type: "STRING" },
                questions: { type: "STRING" },
                news: { type: "STRING" },
            },
            required: REQUIRED_RESPONSE_KEYS,
            propertyOrdering: REQUIRED_RESPONSE_KEYS,
        };

        const model = genAI.getGenerativeModel({
            // Use gemini-2.5-flash for its speed and reliability with structured output and function calling.
            model: "gemini-2.5-flash",
            generationConfig: {
                responseSchema: responseSchema,
                maxOutputTokens: 2048,
                temperature: 0.5 // Add temperature for controlled, creative responses
            },
            // Define the custom tool for Google Search
            tools: [{
                functionDeclarations: [{
                    name: "googleSearch",
                    description: "Search Google for up-to-date lead or industry information. Use this only once, passing a single, targeted query.",
                    parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
                }]
            }]
        });
        
        const promptContent = createPrompt(leadData, idealClient);

        try {
            const result = await model.generateContent({
                contents: [{ role: "user", parts: [{ text: promptContent }] }],
                // The toolResponseHandler executes the googleSearch function when the model calls for it.
                toolResponseHandler: async (toolCall) => {
                    if (toolCall.name === "googleSearch") {
                        const searchResults = await googleSearch(toolCall.args.query);
                        // Return the search results to the model to use as grounding data
                        return { 
                            functionResponse: {
                                name: toolCall.name,
                                // Pass results or error from the custom search function
                                response: { data: searchResults }
                            }
                        };
                    }
                }
            });
            
            // Await result.response.text() to resolve the final response promise.
            const responseText = await result.response.text();
            
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
                // The model output is expected to be a valid JSON string matching the schema
                finalParsedData = JSON.parse(responseText);
            } catch (jsonError) {
                console.error(`[LeadQualifier] Request ID: ${requestId} - JSON parsing failed: ${jsonError.message}`, { rawAIResponse: responseText });
                return {
                    statusCode: 500,
                    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
                    body: JSON.stringify(fallbackResponse("AI provided an invalid JSON response.", responseText))
                };
            }
            
            // Final validation to ensure all required fields are present
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

            // Success response
            return {
                statusCode: 200,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
                body: JSON.stringify(finalParsedData)
            };

        } catch (apiError) {
            console.error(`[LeadQualifier] Request ID: ${requestId} - API call failed: ${apiError.message}`, { stack: apiError.stack });
            const fallback = fallbackResponse("AI report generation failed. Please retry shortly. Check Netlify logs for details.");
            return {
                statusCode: 500,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json", "Accept": "application/json" },
                body: JSON.stringify(fallback)
            };
        }

    } catch (error) {
        console.error(`[LeadQualifier] Request ID: ${requestId} - Function error: ${error.message}`, { stack: error.stack });
        const fallback = fallbackResponse("Internal Server Error: Failed to process request body.");
        return { 
            statusCode: 500, 
            headers: { ...CORS_HEADERS, "Content-Type": "application/json", "Accept": "application/json" }, 
            body: JSON.stringify(fallback) 
        };
    }
};
