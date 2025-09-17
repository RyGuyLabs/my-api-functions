// File: netlify/functions/lead-qualifier.js
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fetch = require('node-fetch');

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

const geminiApiKey = process.env.FIRST_API_KEY;
const searchApiKey = process.env.RYGUY_SEARCH_API_KEY;
const searchEngineId = process.env.RYGUY_SEARCH_ENGINE_ID;

const genAI = new GoogleGenerativeAI(geminiApiKey);

// Google Custom Search helper
async function googleSearch(query) {
    const url = `https://www.googleapis.com/customsearch/v1?key=${searchApiKey}&cx=${searchEngineId}&q=${encodeURIComponent(query)}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Google Search failed: ${response.status}`);
    const data = await response.json();

    if (!data.items || data.items.length === 0) {
        return "No results found.";
    }

    return data.items
        .map(
            (item) =>
                `<p><strong>${item.title}</strong><br>${item.snippet}<br><a href="${item.link}" target="_blank">${item.link}</a></p>`
        )
        .join("\n");
}

exports.handler = async (event, context) => {
    // Handle CORS preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: CORS_HEADERS, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { leadData, idealClient } = JSON.parse(event.body);

        if (!leadData) {
            return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "Missing leadData" }) };
        }

        const model = genAI.getGenerativeModel({
            model: "gemini-pro",
            tools: [{
                functionDeclarations: [{
                    name: "googleSearch",
                    description: "Search Google for up-to-date lead or industry information.",
                    parameters: {
                        type: "object",
                        properties: {
                            query: { type: "string", description: "The search query" },
                        },
                        required: ["query"],
                    },
                }],
            }],
        });

        let conversation = model.startChat({ history: [] });

        let result = await conversation.sendMessage({
            role: "user",
            parts: [{
                text: `You are a top-tier sales consultant. Using the lead and ideal client info below, generate a professional sales report in structured JSON with keys: report, predictive, outreach, questions, news.  
Lead Details:
${JSON.stringify(leadData, null, 2)}

Ideal Client Profile:
${JSON.stringify(idealClient || {}, null, 2)}

If you need recent info, call googleSearch.`,
            }],
        });

        let response = await result.response;
        let candidate = response.candidates?.[0];
        let content = candidate?.content?.parts?.[0];

        if (content?.functionCall) {
            const { name, args } = content.functionCall;
            if (name === "googleSearch" && args?.query) {
                const searchResults = await googleSearch(args.query);

                result = await conversation.sendMessage({
                    role: "function",
                    parts: [{
                        functionResponse: {
                            name: "googleSearch",
                            response: { output: searchResults },
                        },
                    }],
                });
                response = await result.response;
                candidate = response.candidates?.[0];
                content = candidate?.content?.parts?.[0];
            }
        }

        const rawText = content?.text || "No response generated.";
        let parsed;
        try {
            parsed = JSON.parse(rawText);
        } catch (err) {
            parsed = {
                report: `<p>${rawText}</p>`,
                predictive: "<p>No predictive insights.</p>",
                outreach: "<p>No outreach generated.</p>",
                questions: "<p>No questions generated.</p>",
                news: "<p>No news available.</p>",
            };
        }

        return {
            statusCode: 200,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            body: JSON.stringify({
                report: parsed.report || "<p>No report generated.</p>",
                predictive: parsed.predictive || "<p>No predictive insights.</p>",
                outreach: parsed.outreach || "<p>No outreach suggestions.</p>",
                questions: parsed.questions || "<p>No questions generated.</p>",
                news: parsed.news || "<p>No news available.</p>",
            }),
        };
    } catch (error) {
        console.error("Lead qualifier error:", error);
        return {
            statusCode: 500,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: `Failed to generate lead report: ${error.message || error}` }),
        };
    }
};
