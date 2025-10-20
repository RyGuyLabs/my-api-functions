// Netlify Function to securely proxy the request to the Gemini API
const fetch = require('node-fetch');

// This function determines the system prompt and temperature based on the client's selected mode
function getApiConfig(taskMode) {
    let systemPrompt = "";
    let temperature = 0.2; // Default for factual, grounded reports

    switch (taskMode) {
        case 'summary':
            systemPrompt = "You are a senior executive assistant. Summarize the user's query into 3-5 high-impact, bulleted key points for a leadership audience. Be succinct and professional.";
            temperature = 0.1; // Very low for strict, factual summarization
            break;
        case 'brainstorm':
            systemPrompt = "You are a creative strategist. Generate multiple, diverse, and innovative ideas or solutions for the user's query. Use an encouraging and expansive tone.";
            temperature = 0.9; // High for creativity
            break;
        case 'report': // Default case
        default:
            systemPrompt = "You are a concise, insightful data analyst providing grounded reports based on the latest available information.";
            temperature = 0.2;
            break;
    }

    return { systemPrompt, temperature };
}

// Main handler for the Netlify Function
exports.handler = async (event, context) => {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ message: "Method Not Allowed. Use POST." })
        };
    }
    
    // Ensure the API Key is set in Netlify environment variables
    const apiKey = process.env.GEMINI_API_KEY; 
    if (!apiKey) {
        console.error("GEMINI_API_KEY environment variable is not set.");
        return {
            statusCode: 500,
            body: JSON.stringify({ message: "Server configuration error: API Key missing." })
        };
    }

    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

    try {
        const { query, taskMode } = JSON.parse(event.body);

        if (!query) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: "Missing required 'query' parameter." })
            };
        }

        const { systemPrompt, temperature } = getApiConfig(taskMode);

        // Construct the full Gemini API payload (including tools for grounding)
        const geminiPayload = {
            contents: [{ parts: [{ text: query }] }],
            tools: [{ "google_search": {} }],
            systemInstruction: {
                parts: [{ text: systemPrompt }]
            },
            generationConfig: {
                temperature: temperature, 
            }
        };

        // Call the Gemini API securely from the backend
        const geminiResponse = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiPayload)
        });

        const result = await geminiResponse.json();
        const candidate = result.candidates?.[0];

        if (!geminiResponse.ok || !candidate) {
             console.error("Gemini API Error:", result);
             return {
                 statusCode: geminiResponse.status || 500,
                 body: JSON.stringify({ 
                    message: "Gemini API call failed.", 
                    details: result.error?.message || "Check function logs." 
                 })
             };
        }

        const text = candidate.content.parts[0].text;
        let sources = [];

        // Extract and format grounding sources for the frontend
        const groundingMetadata = candidate.groundingMetadata;
        if (groundingMetadata && groundingMetadata.groundingAttributions) {
            sources = groundingMetadata.groundingAttributions
                .map(attribution => ({
                    uri: attribution.web?.uri,
                    title: attribution.web?.title,
                }))
                .filter(source => source.uri && source.title); 
        }

        // Send the final result back to the frontend
        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, sources })
        };

    } catch (error) {
        console.error('Netlify Function execution error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Internal Server Error processing request.' })
        };
    }
};
