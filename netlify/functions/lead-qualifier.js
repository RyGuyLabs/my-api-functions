const { GoogleGenerativeAI } = require("@google/generative-ai");
const fetch = require("node-fetch");
const crypto = require("crypto");

// Consistent CORS headers for all responses.
const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
};

// Set your environment variables in the Netlify UI.
// They will be available here automatically.
const geminiApiKey = process.env.FIRST_API_KEY;
const searchApiKey = process.env.RYGUY_SEARCH_API_KEY;
const searchEngineId = process.env.RYGUY_SEARCH_ENGINE_ID;

// Define the canonical fallback response as a single source of truth
const FALLBACK_RESPONSE = {
    report: "",
    predictive: "",
    outreach: "",
    questions: [],
    relevantNews: [],
    leadScore: 0,
};

// Define the required keys for the JSON response
const REQUIRED_RESPONSE_KEYS = ["report", "predictive", "outreach", "questions", "relevantNews"];

// A map of error messages for a single source of truth
const ERROR_MESSAGES = {
    'ai_empty_response': "AI returned an empty response. This may be due to a malformed API key or content that violates safety settings.",
    'schema_validation_failed': "The AI provided an unexpected JSON structure.",
    'json_parse_failed': "JSON parsing failed. The request body or AI response was invalid.",
    'api_call_failed': "API call failed after multiple retries. Please check your network connection or try again later.",
    'invalid_request_body': "Invalid or missing request body data.",
    'api_key_missing': "Server configuration error: Gemini API key is missing or invalid.",
    'method_not_allowed': "Method Not Allowed.",
    'search_quota_exceeded': "Google Search quota exceeded. Try again later."
};

/**
 * Factory function for generating a consistent fallback response with debug info.
 * @param {string} message The primary error message.
 * @param {string} errorKey The key from the ERROR_MESSAGES map.
 * @param {string} [rawAIResponse] The raw AI response for debugging.
 * @param {object} [extraFields] Additional debug fields.
 * @returns {object} The standardized fallback response object.
 */
function fallbackResponse(message, errorKey, rawAIResponse = null, extraFields = null) {
    const isDevelopment = process.env.ENV === "development";
    const response = { ...FALLBACK_RESPONSE };
    response.report = `<p>Error: ${message}</p>`;

    if (isDevelopment) {
        response.debug = {
            errorKey: errorKey,
            rawResponse: rawAIResponse,
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
            if (err.name === "AbortError" || err.retriable) {
                // If it's a timeout or a retriable error and we have more attempts, retry.
                if (attempt < maxRetries) {
                    attempt++;
                    console.warn(`[LeadQualifier] Fetch failed, retrying... (Attempt ${attempt}/${maxRetries + 1})`);
                    await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt - 1)));
                    continue;
                }
            }
            throw err; // Re-throw the error if it's not retriable or we've run out of attempts.
        } finally {
            clearTimeout(timeout);
        }
    }
}

// Correctly handle the Google Search Tool Function
async function googleSearch(query) {
    console.log(`[LeadQualifier] Initiating Google Search for query: "${query}"`);

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
                const error = new Error(ERROR_MESSAGES.search_quota_exceeded);
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
            console.log(`[LeadQualifier] Google Search returned no results for query: "${query}"`);
            return { message: "No results found." };
        }
        const searchResults = data.items.map(item => ({
            title: item.title,
            url: item.link,
            snippet: item.snippet
        }));
        console.log(`[LeadQualifier] Google Search successful. Found ${searchResults.length} results.`);
        // Return a consistent object with a `results` key.
        return { results: searchResults };
    } catch (error) {
        console.error(`[LeadQualifier] Google Search error after all retries for query "${query}": ${error.message}`);
        // Return a consistent error object.
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
    return `You are a seasoned sales consultant specializing in strategic lead qualification. Your goal is to generate a comprehensive, actionable, and highly personalized sales report for an account executive.

    **Instructions for Tone and Quality:**
    * **Strategic & Insightful:** The report should demonstrate a deep, nuanced understanding of the lead's business, industry trends, and potential challenges.
    * **Memorable & Impactful:** Frame the lead's profile in a compelling narrative that highlights their unique potential and the specific value our solution can provide.
    * **Friendly & Resonating:** Use a warm, human tone, especially in the predictive and outreach sections, to build rapport and trust.

    **Instructions for Each Key:**
    * **"report":** A comprehensive, one-paragraph strategic summary. Frame the key opportunity and explain the "why" behind the analysis. Connect the dots between the lead's data and ideal client profile.
    * **"predictive":** A strategic plan with in-depth and elaborate insights. Start with a 1-2 sentence empathetic and intelligent prediction about the lead's future needs or challenges, and then use a bulleted list to detail a strategy for communicating with them.
    * **"outreach":** A professional, friendly, and highly personalized outreach message formatted as a plan with appropriate line breaks for easy copy-pasting. Use "\\n" to create line breaks for new paragraphs.
    * **"questions":** An array of 3-5 thought-provoking, open-ended questions. The questions should be designed to validate your assumptions and guide a productive, two-way conversation with the lead.
    * **"relevantNews":** An array of up to 5 objects. Each object must have a "title", a "url", and a "snippet" for a recent, relevant news article about the lead's company. You MUST use the 'googleSearch' tool for this. The 'url' must be a direct link to the news article.

    **Data for Analysis:**
    * **Lead Data:** ${JSON.stringify(leadData)}
    * **Ideal Client Profile:** ${JSON.stringify(idealClient || {})}
    
    Do not include any conversational text or explanation outside of the JSON object. All string values MUST be valid JSON strings, with all special characters correctly escaped (e.g., use \\n for new lines, and \\" for double quotes).`;
}

// Helper function to parse values like "$250M+" into a number.
function parseValue(value) {
    if (typeof value !== 'string') return null;
    const cleanedValue = value.replace(/[^0-9.kKmM]/g, '').toLowerCase();
    const numericValue = parseFloat(cleanedValue);
    if (isNaN(numericValue)) return null;

    if (cleanedValue.includes('m')) {
        return numericValue * 1000000;
    }
    if (cleanedValue.includes('k')) {
        return numericValue * 1000;
    }
    return numericValue;
}

/**
 * Calculates a lead score from 0-100 based on matching fields
 * between the lead data and the ideal client profile.
 * @param {object} leadData
 * @param {object} idealClient
 * @returns {number} The calculated lead score.
 */
function calculateLeadScore(leadData, idealClient) {
    if (!idealClient || Object.keys(idealClient).length === 0) {
        console.log("[LeadQualifier] Ideal client profile is empty. Returning score 0.");
        return 0;
    }
    
    console.log("[LeadQualifier] Starting lead score calculation.");
    console.log("[LeadQualifier] Lead Data:", leadData);
    console.log("[LeadQualifier] Ideal Client:", idealClient);

    const idealKeys = Object.keys(idealClient);
    let score = 0;
    const maxPoints = idealKeys.length * 20; // Each field worth 20 points
    
    if (maxPoints === 0) {
        console.log("[LeadQualifier] Ideal client profile has no fields. Returning score 0.");
        return 0;
    }

    idealKeys.forEach(key => {
        const leadValue = leadData[key];
        const idealValue = idealClient[key];

        // Check if the key exists in both objects
        if (leadValue === undefined || idealValue === undefined || !idealValue) {
            console.log(`[LeadQualifier] Skipping comparison for key: "${key}" because it is missing in one of the profiles.`);
            return;
        }

        // Perform more robust comparisons for different data types
        if (typeof leadValue === 'string' && typeof idealValue === 'string') {
            if (key === 'size') {
                // Special handling for the "50+ employees" format
                const idealSizeNumber = parseInt(idealValue.replace(/[^0-9]/g, ''), 10);
                const leadSizeNumber = parseInt(leadValue.replace(/[^0-9]/g, ''), 10);
                if (!isNaN(idealSizeNumber) && !isNaN(leadSizeNumber) && leadSizeNumber >= idealSizeNumber) {
                    score += 20;
                    console.log(`[LeadQualifier] Match found for key: "${key}". Score: ${score}`);
                } else {
                    console.log(`[LeadQualifier] No size match for key: "${key}". Lead value: "${leadValue}", Ideal value: "${idealValue}"`);
                }
            } else if (key === 'revenue' || key === 'budget') {
                // Comparison for number-like strings
                const idealNumber = parseValue(idealValue);
                const leadNumber = parseValue(leadValue);
                if (!isNaN(idealNumber) && !isNaN(leadNumber) && leadNumber >= idealNumber) {
                    score += 20;
                    console.log(`[LeadQualifier] Match found for key: "${key}". Score: ${score}`);
                } else {
                    console.log(`[LeadQualifier] No number match for key: "${key}". Lead value: "${leadValue}", Ideal value: "${idealValue}"`);
                }
            } else if (key === 'role') {
                // Check if lead's role is in the list of ideal roles
                const idealRoles = idealValue.split(',').map(s => s.trim().toLowerCase());
                if (idealRoles.includes(leadValue.toLowerCase())) {
                    score += 20;
                    console.log(`[LeadQualifier] Match found for key: "${key}". Score: ${score}`);
                } else {
                    console.log(`[LeadQualifier] No role match for key: "${key}". Lead value: "${leadValue}", Ideal value: "${idealValue}"`);
                }
            } else {
                // Standard string comparison
                if (leadValue.toLowerCase().includes(idealValue.toLowerCase())) {
                    score += 20;
                    console.log(`[LeadQualifier] Match found for key: "${key}". Score: ${score}`);
                } else {
                    console.log(`[LeadQualifier] No match for key: "${key}". Lead value: "${leadValue}", Ideal value: "${idealValue}"`);
                }
            }
        } else {
            // Standard check if values are of the same type and not falsy
            if (leadValue && idealValue && leadValue === idealValue) {
                score += 20;
                console.log(`[LeadQualifier] Match found for key: "${key}". Score: ${score}`);
            } else {
                console.log(`[LeadQualifier] No match for key: "${key}" due to different or missing data types. Lead value: "${leadValue}", Ideal value: "${idealValue}"`);
            }
        }
    });

    // Normalize the score to a 0-100 scale and round to nearest whole number
    const normalizedScore = (score / maxPoints) * 100;
    const finalScore = Math.round(normalizedScore);
    console.log(`[LeadQualifier] Final Score: ${finalScore}`);
    return finalScore;
}

/**
 * Main Netlify serverless function handler.
 * @param {object} event The Netlify event object.
 * @returns {object} The HTTP response object.
 */
exports.handler = async (event) => {
    // Use the Netlify-provided request ID for consistent tracing.
    const requestId = event.requestContext?.requestId || crypto.randomUUID();
    console.log(`[LeadQualifier] Request ID: ${requestId}`);
    
    // Handle pre-flight OPTIONS requests for CORS.
    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 204, headers: CORS_HEADERS };
    }
    
    if (event.httpMethod !== "POST") {
        return { 
            statusCode: 405, 
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, 
            body: JSON.stringify(fallbackResponse(ERROR_MESSAGES.method_not_allowed, 'method_not_allowed'))
        };
    }

    try {
        const { leadData, idealClient } = JSON.parse(event.body);
        
        if (!leadData || Object.keys(leadData).length === 0) {
            return { 
                statusCode: 400, 
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, 
                body: JSON.stringify(fallbackResponse(ERROR_MESSAGES.invalid_request_body, 'invalid_request_body'))
            };
        }

        if (!geminiApiKey || geminiApiKey.length < 10) {
            console.error(`[LeadQualifier] Request ID: ${requestId} - Gemini API key is missing or too short.`);
            return {
                statusCode: 500,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
                body: JSON.stringify(fallbackResponse(ERROR_MESSAGES.api_key_missing, 'api_key_missing'))
            };
        }
    
        const genAI = new GoogleGenerativeAI(geminiApiKey);
        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-pro",
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        report: { type: "STRING" },
                        predictive: { type: "STRING" },
                        outreach: { type: "STRING" },
                        questions: {
                            type: "ARRAY",
                            items: { type: "STRING" }
                        },
                        relevantNews: {
                            type: "ARRAY",
                            items: {
                                type: "OBJECT",
                                properties: {
                                    title: { type: "STRING" },
                                    url: { type: "STRING" },
                                    snippet: { type: "STRING" }
                                },
                                required: ["title", "url", "snippet"]
                            }
                        },
                    },
                    required: ["report", "predictive", "outreach", "questions", "relevantNews"],
                },
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

        // Wrap the core API call logic in the retry mechanism.
        const result = await retryWithTimeout(async () => {
            const initialResponse = await model.generateContent({
                contents: [{ role: "user", parts: [{ text: promptContent }] }],
            });

            const initialCandidate = initialResponse.response.candidates[0];
            const toolCalls = initialCandidate.content.parts.find(p => p.toolCalls)?.toolCalls;
        
            if (toolCalls && toolCalls.length > 0) {
                const toolCall = toolCalls[0];
                console.log(`[LeadQualifier] Request ID: ${requestId} - Executing tool: ${toolCall.name} with query: "${toolCall.args.query}"`);
                const toolCallResponse = await googleSearch(toolCall.args.query);
                console.log(`[LeadQualifier] Request ID: ${requestId} - Tool execution result:`, toolCallResponse);
                
                if (toolCallResponse.error) {
                    const error = new Error(`Tool call failed: ${toolCallResponse.error}`);
                    error.retriable = false;
                    throw error;
                }

                const finalResponse = await model.generateContent({
                    contents: [
                        { role: "user", parts: [{ text: promptContent }] },
                        { role: "model", parts: [{ toolCalls: toolCalls }] },
                        { role: "tool", parts: [{ functionResponse: { name: "googleSearch", response: toolCallResponse } }] }
                    ]
                });
                return finalResponse;
            } else {
                console.warn(`[LeadQualifier] Request ID: ${requestId} - Gemini did not request a tool call. Proceeding with the initial response.`);
                return initialResponse;
            }
        }, 3, 15000); // 3 retries, 15-second timeout

        const responseText = extractText(result.response);
        if (!responseText) {
            console.error(`[LeadQualifier] Request ID: ${requestId} - AI returned an empty direct response.`);
            throw new Error('ai_empty_response');
        }

        const finalParsedData = JSON.parse(responseText);
        
        console.log(`[LeadQualifier] Request ID: ${requestId} - Final Parsed Data:`, finalParsedData);
        
        const allKeysPresent = REQUIRED_RESPONSE_KEYS.every(key => Object.keys(finalParsedData).includes(key));
        
        if (!allKeysPresent) {
            const missingKeys = REQUIRED_RESPONSE_KEYS.filter(key => !Object.keys(finalParsedData).includes(key));
            console.error(`[LeadQualifier] Request ID: ${requestId} - Schema validation failed. Missing keys: ${missingKeys.join(', ')}`);
            const fallback = fallbackResponse(
                ERROR_MESSAGES.schema_validation_failed,
                'schema_validation_failed',
                responseText,
                { missingKeys }
            );
            return {
                statusCode: 500,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
                body: JSON.stringify(fallback)
            };
        }

        const score = calculateLeadScore(leadData, idealClient);
        finalParsedData.leadScore = score;
        
        return {
            statusCode: 200,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            body: JSON.stringify(finalParsedData)
        };

    } catch (error) {
        let errorKey = 'api_call_failed';
        if (error.message.includes('JSON')) errorKey = 'json_parse_failed';
        if (error.message === 'ai_empty_response') errorKey = 'ai_empty_response';
        if (error.message.includes('invalid_request_body')) errorKey = 'invalid_request_body';
        
        console.error(`[LeadQualifier] Request ID: ${requestId} - Main function error: ${error.message}`, { stack: error.stack });
        const fallback = fallbackResponse(ERROR_MESSAGES[errorKey], errorKey);
        
        return { 
            statusCode: 500, 
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, 
            body: JSON.stringify(fallback) 
        };
    }
};
