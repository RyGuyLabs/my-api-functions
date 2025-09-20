const { GoogleGenerativeAI } = require("@google/generative-ai");
const fetch = require("node-fetch");
const Ajv = require("ajv");
const ajv = new Ajv();

// Consistent CORS headers for all responses
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
    additionalProperties: false
};
const validate = ajv.compile(responseSchema);

// Factory function for generating a consistent fallback response
function fallbackResponse(message, textResponse, errors = null) {
    let debugInfo = "";
    const isDevelopment = process.env.NODE_ENV === "development";

    if (isDevelopment) {
        debugInfo += `<p>Raw AI Response:</p><pre>${(textResponse || "[empty]").replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;
        if (errors) {
            debugInfo += `<p>Validation Errors:</p><pre>${JSON.stringify(errors, null, 2)}</pre>`;
        }
    }
    
    // Use a canonical object and overwrite the report key
    const response = { ...FALLBACK_RESPONSE };
    response.report = `<p>Error: ${message}</p>`;
    if (isDevelopment) {
        response.debug = {
            rawResponse: textResponse,
            validationErrors: errors,
            message: message
        };
    }
    return response;
}

// Correctly handle the Google Search Tool Function
async function googleSearch(query) {
    const searchApiKey = process.env.RYGUY_SEARCH_API_KEY;
    const searchEngineId = process.env.RYGUY_SEARCH_ENGINE_ID;
    
    if (!searchApiKey || !searchEngineId) {
        console.error("Missing Google Search API credentials.");
        return { error: "Search credentials missing." };
    }

    const url = `https://www.googleapis.com/customsearch/v1?key=${searchApiKey}&cx=${searchEngineId}&q=${encodeURIComponent(query)}`;
    
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Google Search failed with status: ${response.status}`);
        }
        const data = await response.json();
        if (!data.items || !data.items.length) {
            return { message: "No results found." };
        }
        // Return a structured JSON array instead of raw HTML
        return data.items.map(item => ({
            title: item.title,
            link: item.link,
            snippet: item.snippet
        }));
    } catch (error) {
        console.error("Google Search error:", error);
        return { error: `Error performing search: ${error.message}` };
    }
}

exports.handler = async (event) => {
    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 204, headers: CORS_HEADERS };
    }
    
    if (event.httpMethod !== "POST") {
        return { 
            statusCode: 405, 
            headers: CORS_HEADERS, 
            body: JSON.stringify({ error: "Method Not Allowed" }) 
        };
    }

    try {
        const { leadData, idealClient } = JSON.parse(event.body);
        
        if (!leadData || Object.keys(leadData).length === 0) {
            return { 
                statusCode: 400, 
                headers: CORS_HEADERS, 
                body: JSON.stringify({ error: "Missing leadData in request body." }) 
            };
        }

		// New check to ensure the API key is available
		if (!geminiApiKey) {
			console.error("Missing Gemini API Key in environment variables.");
			return {
				statusCode: 500,
				headers: CORS_HEADERS,
				body: JSON.stringify(fallbackResponse("Server configuration error: Gemini API key is missing."))
			};
		}
		
		const genAI = new GoogleGenerativeAI(geminiApiKey);

        const model = genAI.getGenerativeModel({
            model: process.env.GEMINI_MODEL || "gemini-2.5-flash-preview-05-20",
            // Explicitly define safety settings for predictable production behavior
            // Using only valid categories
            safetySettings: [
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }
            ],
            // Use generationConfig to enforce JSON output and avoid fragile parsing
            generationConfig: {
                responseMimeType: "application/json"
            },
            tools: [{
                functionDeclarations: [{
                    name: "googleSearch",
                    description: "Search Google for up-to-date lead or industry information.",
                    parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
                }]
            }]
        });

        const promptContent = `Generate a professional sales report as a single JSON object with the following keys: "report", "predictive", "outreach", "questions", and "news".
            
            Based on the following data:
            Lead Data: ${JSON.stringify(leadData)}
            Ideal Client Profile: ${JSON.stringify(idealClient || {})}
            
            Use the 'googleSearch' tool for relevant, up-to-date information, especially for the 'news' key. The googleSearch tool will return a JSON array of objects. Use the "title", "link", and "snippet" from each object to create a well-formatted HTML output for the "news" key.
            If you are unable to generate a valid JSON response for any reason, return the following JSON object exactly:
            ${JSON.stringify(FALLBACK_RESPONSE)}
            
            Do not include any conversational text or explanation outside of the JSON object.`;

        // Use the more efficient toolResponseHandler for a single logical API call
        let conversation = model.startChat({ history: [] });
        const response = await conversation.sendMessage(promptContent, {
            toolResponseHandler: async (toolCall) => {
                if (toolCall.name === "googleSearch") {
                    const searchResults = await googleSearch(toolCall.args.query);
                    // Handle errors from the tool function gracefully
                    if (searchResults.error) {
                         // Return a structured error response that Gemini can handle
                         return { 
                            functionResponse: {
                                name: toolCall.name,
                                response: { error: searchResults.error, items: [] }
                            }
                        };
                    }
                    // Use the correct functionResponse return structure
                    return { 
                        functionResponse: {
                            name: toolCall.name,
                            response: searchResults 
                        }
                    };
                } else {
                    console.warn("Unrecognized function call:", toolCall.name);
                    return { output: "Unrecognized function." };
                }
            }
        });
        
        let parsedData = {};
        let textResponse = "";

        try {
            // Safer extraction using the SDK's text() method
            textResponse = response.response?.text() || "";
            if (!textResponse) {
                throw new Error("API returned an empty response.");
            }
            parsedData = JSON.parse(textResponse);
            if (!validate(parsedData)) {
                console.error("Schema validation failed", { errors: validate.errors, parsedData });
                throw new Error("Parsed JSON object did not match the expected schema.");
            }
        } catch (jsonError) {
            // Add stack to the console log for better debugging
            console.error("Failed to process Gemini's response:", jsonError.message, { textResponse, stack: jsonError.stack });
            // Use more specific error messages
            let errorMessage = "Could not generate a valid report.";
            if (jsonError.message.includes("empty response")) {
                errorMessage = "AI returned an empty response. Please check API key permissions.";
            } else if (jsonError.message.includes("validation failed")) {
                errorMessage = "Schema validation failed. AI provided an unexpected JSON structure.";
            } else if (jsonError.message.includes("JSON")) {
                errorMessage = "JSON parsing failed. AI provided an invalid JSON response.";
            }

            parsedData = fallbackResponse(errorMessage, textResponse, validate.errors);
        }

        return { 
            statusCode: 200, 
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, 
            body: JSON.stringify(parsedData) 
        };

    } catch (error) {
        console.error("Lead qualifier function error:", error.message, { stack: error.stack });
        const fallback = fallbackResponse("AI report generation failed. Please retry shortly.");
        return { 
            statusCode: 500, 
            headers: CORS_HEADERS, 
            body: JSON.stringify(fallback) 
        };
    }
};
