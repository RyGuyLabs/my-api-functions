// File: netlify/functions/lead-qualifier.js
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fetch = require("node-fetch");

// Consistent CORS headers for all responses
const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
};

const geminiApiKey = process.env.FIRST_API_KEY;
const genAI = new GoogleGenerativeAI(geminiApiKey);

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
    // Handle OPTIONS method for CORS preflight requests
    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 204, headers: CORS_HEADERS };
    }
    
    // Ensure the request is a POST
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
            model: "gemini-1.5",
            tools: [{
                functionDeclarations: [{
                    name: "googleSearch",
                    description: "Search Google for up-to-date lead or industry information.",
                    parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
                }]
            }]
        });

        // Initialize chat with history
        let conversation = model.startChat({ history: [] });

        // Prompt the model to return a JSON object directly
        const prompt = {
            role: "user",
            content: `Generate a professional sales report as a single JSON object with the following keys: "report", "predictive", "outreach", "questions", and "news". The values for these keys should be HTML-formatted strings with clear headings and bullet points.
            
            Based on the following data:
            Lead Data: ${JSON.stringify(leadData)}
            Ideal Client Profile: ${JSON.stringify(idealClient || {})}
            
            Use the 'googleSearch' tool for relevant, up-to-date information, especially for the 'news' key.
            Do not include any conversational text or explanation outside of the JSON object.
            `
        };

        let response = await conversation.sendMessage(prompt.content);
        const firstPart = response.candidates?.[0]?.content?.[0];

        // Handle tool calls first, then get the final response
        if (firstPart?.functionCall) {
            const { name, args } = firstPart.functionCall;
            if (name === "googleSearch") {
                const searchResults = await googleSearch(args.query);
                const followupResponse = await conversation.sendMessage({
                    role: "function",
                    content: [{
                        functionResponse: {
                            name: "googleSearch",
                            response: { output: searchResults }
                        }
                    }]
                });
                response = followupResponse.response;
            }
        }
        
        let textResponse = response?.candidates?.[0]?.content?.map(p => p.text).join(" ") || "";
        
        // Final attempt to parse as JSON
        let parsedData = {};
        try {
            parsedData = JSON.parse(textResponse.trim());
        } catch (jsonError) {
            console.error("Failed to parse Gemini's response as JSON:", jsonError);
            console.error("Gemini response was:", textResponse);
            // Fallback to a structured error or default content
            parsedData = {
                report: `<p>Error: Could not generate report. Gemini returned a non-JSON response.</p>`,
                predictive: "",
                outreach: "",
                questions: "",
                news: `<p>Raw AI Response:</p><pre>${textResponse.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`
            };
        }

        return { 
            statusCode: 200, 
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, 
            body: JSON.stringify(parsedData) 
        };

    } catch (error) {
        console.error("Lead qualifier function error:", error);
        return { 
            statusCode: 500, 
            headers: CORS_HEADERS, 
            body: JSON.stringify({ 
                error: "Internal server error. Please check logs.", 
                details: error.message 
            }) 
        };
    }
};
