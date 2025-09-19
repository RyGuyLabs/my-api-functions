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
            tools: [{
                functionDeclarations: [{
                    name: "googleSearch",
                    description: "Search Google for up-to-date lead or industry information.",
                    parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
                }]
            }]
        });

        let conversation = model.startChat({ history: [] });
        const promptContent = `Generate a professional sales report as a single JSON object with the following keys: "report", "predictive", "outreach", "questions", and "news". The values for these keys should be HTML-formatted strings with clear headings and bullet points.
            
            Based on the following data:
            Lead Data: ${JSON.stringify(leadData)}
            Ideal Client Profile: ${JSON.stringify(idealClient || {})}
            
            Use the 'googleSearch' tool for relevant, up-to-date information, especially for the 'news' key.
            If you are unable to generate a valid JSON response for any reason, return the following JSON object exactly:
            {"report": "<p>Error: The AI could not generate a valid report. Please try again.</p>", "predictive": "", "outreach": "", "questions": "", "news": ""}
            
            Do not include any conversational text or explanation outside of the JSON object.
            `;

        let textResponse = "";
        let response = await conversation.sendMessage(promptContent);

        // While loop for chained tool calls
        while (response?.candidates?.[0]?.content?.[0]?.functionCall) {
            const toolCall = response.candidates[0].content[0].functionCall;
            if (toolCall.name === "googleSearch") {
                const searchResults = await googleSearch(toolCall.args.query);
                response = await conversation.sendMessage({
                    role: "function",
                    content: [{
                        functionResponse: {
                            name: "googleSearch",
                            response: { output: searchResults }
                        }
                    }]
                });
            } else {
                console.warn(`Unrecognized function call: ${toolCall.name}`);
                break;
            }
        }
        
        textResponse = response?.candidates?.[0]?.content?.[0]?.text || "";

        let parsedData = {};
        try {
            // Safer JSON parsing by stripping markdown fences and trimming braces
            let cleanedText = textResponse.replace(/```json|```/g, "").trim();
            const firstBrace = cleanedText.indexOf("{");
            const lastBrace = cleanedText.lastIndexOf("}");
            
            if (firstBrace !== -1 && lastBrace !== -1) {
                cleanedText = cleanedText.slice(firstBrace, lastBrace + 1);
            }
            
            parsedData = JSON.parse(cleanedText);
        } catch (jsonError) {
            console.error("Failed to parse Gemini's response as JSON:", jsonError);
            console.error("Gemini response was:", textResponse);

            // Conditional error response based on environment
            const debugInfo = process.env.NODE_ENV === "development" ? `<p>Raw AI Response:</p><pre>${textResponse.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>` : "";
            
            parsedData = {
                report: `<p>Error: Could not generate a valid report. The AI returned a non-JSON response.</p>`,
                predictive: "",
                outreach: "",
                questions: "",
                news: debugInfo
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
                error: "AI report generation failed. Please retry shortly."
            }) 
        };
    }
};
