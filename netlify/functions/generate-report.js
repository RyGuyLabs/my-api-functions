const fetch = require('node-fetch');

// Define CORS headers once for use in all responses (success and error)
// This explicitly allows requests from your frontend domain.
const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "https://www.ryguylabs.com", // <-- FIX: Specify the exact allowed origin
    "Access-Control-Allow-Methods": "POST, OPTIONS", // Allow POST and the preflight OPTIONS
    "Access-Control-Allow-Headers": "Content-Type",
};

// This function acts as a secure proxy to the Gemini API,
// keeping the API key hidden in Netlify environment variables.
// The client passes 'query' and 'taskMode', and this serverless function
// handles the authentication and dynamic prompt construction.
exports.handler = async (event, context) => {

    // 1. Handle Preflight OPTIONS request (REQUIRED for CORS)
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 204, // 204 No Content for a successful preflight
            headers: CORS_HEADERS,
            body: "",
        };
    }

    // 2. Get the API Key from Netlify Environment Variables
    const apiKey = process.env.FIRST_API_KEY; 

    if (!apiKey) {
        return {
            statusCode: 500,
            headers: CORS_HEADERS, // Include headers even on server error
            body: JSON.stringify({ message: "Server configuration error: FIRST_API_KEY environment variable is not set." }),
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: "Method Not Allowed" }),
        };
    }

    let body;
    try {
        body = JSON.parse(event.body);
    } catch (e) {
        return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: "Invalid JSON body provided." }),
        };
    }

    const { query, taskMode } = body;

    if (!query) {
        return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: "Missing required field: query." }),
        };
    }

    // --- 3. Dynamic Model Configuration based on taskMode ---
    let systemPrompt = "";
    let temperature = 0.2; 
    const model = "gemini-pro";

    switch (taskMode) {
        case 'summary':
            systemPrompt = "You are a senior executive assistant. Summarize the user's query into 3-5 high-impact, bulleted key points for a leadership audience. Be succinct and professional.";
            temperature = 0.1;
            break;
        case 'brainstorm':
            systemPrompt = "You are a creative strategist. Generate multiple, diverse, and innovative ideas or solutions for the user's query. Use an encouraging and expansive tone.";
            temperature = 0.9;
            break;
        case 'report': // Default case
        default:
            systemPrompt = "You are a concise, insightful data analyst providing grounded reports based on the latest available information.";
            temperature = 0.2;
            break;
    }
    // ---------------------------------------------------------

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const payload = {
        contents: [{ parts: [{ text: query }] }],
        // CRITICAL: Enabling Google Search grounding
        tools: [{ "google_search": {} }],
        systemInstruction: {
            parts: [{ text: systemPrompt }]
        },
        generationConfig: {
            temperature: temperature,
        }
    };
    
    // --- 4. Call the Gemini API with Internal Retry Logic ---
    const maxRetries = 5;
    let response;

    for (let i = 0; i < maxRetries; i++) {
        try {
            response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            // If we get an OK or an error that isn't a rate limit, stop retrying
            if (response.ok || response.status !== 429) {
                break; 
            }

            // Handle rate limiting (429)
            const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
            console.warn(`Gemini API rate limit hit. Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            
        } catch (error) {
            // Log network error and continue to retry if not last attempt
            console.error(`Attempt ${i + 1} failed (Network Error):`, error.message);
            if (i === maxRetries - 1) {
                throw new Error("Gemini API call failed after multiple retries due to persistent network issues.");
            }
            const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    if (!response || !response.ok) {
        // Handle final failure response from the Gemini API
        const errorBody = await response.json().catch(() => ({}));
        const status = response ? response.status : 503;
        const message = errorBody.error?.message || "Internal server error during API call.";
        
        return {
            statusCode: status,
            headers: CORS_HEADERS, // Include headers on failure
            body: JSON.stringify({ message: `Gemini API Call Failed: ${message}` }),
        };
    }

    // --- 5. Process the successful Gemini Response ---
    const result = await response.json();
    const candidate = result.candidates?.[0];

    if (candidate && candidate.content?.parts?.[0]?.text) {
        const text = candidate.content.parts[0].text;
        
        // Extract grounding sources
        let sources = [];
        const groundingMetadata = candidate.groundingMetadata;
        if (groundingMetadata && groundingMetadata.groundingAttributions) {
            sources = groundingMetadata.groundingAttributions
                .map(attribution => ({
                    uri: attribution.web?.uri,
                    title: attribution.web?.title,
                }))
                .filter(source => source.uri && source.title); 
        }

        // Return the clean, structured data to the frontend
        return {
            statusCode: 200,
            headers: CORS_HEADERS, // <-- FIX: Include CORS headers on success
            body: JSON.stringify({ text, sources }),
        };

    } else {
        return {
            statusCode: 500,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: "Gemini API returned empty or unparseable content." }),
        };
    }
};
