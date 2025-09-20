// File: netlify/functions/lead-qualifier.js
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
const genAI = new GoogleGenerativeAI(geminiApiKey);

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
function fallbackResponse(message, textResponse) {
    const debugInfo = process.env.NODE_ENV === "development"
        ? `<p>Raw AI Response:</p><pre>${(textResponse || "[empty]").replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`
        : "";
    
    // Use a canonical object and overwrite the report key
    const response = { ...FALLBACK_RESPONSE };
    response.report = `<p>Error: ${message}</p>`;
    response.news = debugInfo;
    return response;
}

// Correctly handle the Google Search Tool Function
async function googleSearch(query) {
    const searchApiKey = process.env.RYGUY_SEARCH_API_KEY;
    const searchEngineId = process.env.RYGUY_SEARCH_ENGINE_ID;
    
    if (!searchApiKey || !searchEngineId) {
        console.error("Missing Google Search API credentials.");
        return "Search credentials missing.";
    }

    const url = `https://www.googleapis.com/customsearch/v1?key=${searchApiKey}&cx=${searchEngineId}&q=${encodeURIComponent(query)}`;
    
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Google Search failed with status: ${response.status}`);
        }
        const data = await response.json();
        if (!data.items || !data.items.length) {
            return "No results found.";
        }
        return data.items.map(item => `
            <div class="news-item mb-4 p-4 rounded-lg bg-gray-700 bg-opacity-30">
                <a href="${item.link}" target="_blank" class="text-blue-300 hover:underline"><strong>${item.title}</strong></a>
                <p class="text-sm mt-1 text-gray-400">${item.snippet}</p>
            </div>
        `).join("\n");
    } catch (error) {
        console.error("Google Search error:", error);
        return "Error performing search.";
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

        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-pro",
            // Explicitly define safety settings for predictable production behavior
            safetySettings: [
                { category: "HARM_CATEGORY_DEROGATORY", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                { category: "HARM_CATEGORY_VIOLENCE", threshold: "BLOCK_MEDIUM_AND_ABOVE" }
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

        const promptContent = `Generate a professional sales report as a single JSON object with the following keys: "report", "predictive", "outreach", "questions", and "news". The values for these keys should be HTML-formatted strings with clear headings and bullet points.
            
            Based on the following data:
            Lead Data: ${JSON.stringify(leadData)}
            Ideal Client Profile: ${JSON.stringify(idealClient || {})}
            
            Use the 'googleSearch' tool for relevant, up-to-date information, especially for the 'news' key.
            If you are unable to generate a valid JSON response for any reason, return the following JSON object exactly:
            ${JSON.stringify(FALLBACK_RESPONSE)}
            
            Do not include any conversational text or explanation outside of the JSON object.`;

        // Use the more efficient toolResponseHandler for a single logical API call
        let conversation = model.startChat({ history: [] });
        const response = await conversation.sendMessage(promptContent, {
            toolResponseHandler: async (toolCall) => {
                if (toolCall.name === "googleSearch") {
                    const searchResults = await googleSearch(toolCall.args.query);
                    return { output: searchResults };
                } else {
                    console.warn("Unrecognized function call:", toolCall.name);
                    return { output: "Unrecognized function." };
                }
            }
        });
        
        const textResponse = response?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        let parsedData = {};

        try {
            // Because we're using responseMimeType, the response is guaranteed to be clean JSON
            parsedData = JSON.parse(textResponse);
            if (!validate(parsedData)) {
                console.error("Schema validation failed", { errors: validate.errors, parsedData });
                throw new Error("Parsed JSON object did not match the expected schema.");
            }
        } catch (jsonError) {
            console.error("Failed to process Gemini's response:", jsonError.message, { textResponse });
            parsedData = fallbackResponse("Could not generate a valid report.", textResponse);
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
