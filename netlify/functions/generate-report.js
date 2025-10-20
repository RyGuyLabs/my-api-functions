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

// Helper function to implement exponential backoff and retry for fetch requests
async function fetchWithRetry(url, options, maxRetries = 5) {
    const TIMEOUT_MS = 25000; // Hard timeout of 25 seconds for each attempt

    for (let i = 0; i < maxRetries; i++) {
        // Create an AbortController for the current fetch attempt
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort();
        }, TIMEOUT_MS);

        // Calculate delay: 1s, 2s, 4s, 8s, 16s...
        const delay = Math.pow(2, i) * 1000; 
        
        try {
            // Include the signal from the AbortController in the fetch options
            const response = await fetch(url, { ...options, signal: controller.signal });
            
            clearTimeout(timeoutId); // Clear the timeout if the request succeeds

            // Retry on 429 (Too Many Requests) or 5xx status codes
            if (response.status === 429 || response.status >= 500) {
                console.warn(`API request failed with status ${response.status}. Retrying in ${delay / 1000}s... (Attempt ${i + 1}/${maxRetries})`);
                if (i < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
            }
            
            // For 2xx and 4xx status codes, return the response immediately for error processing
            return response;

        } catch (error) {
            clearTimeout(timeoutId); // Clear the timeout on any error/abort
            
            // Check if the error was due to the explicit timeout abort
            if (error.name === 'AbortError') {
                console.error(`Fetch attempt ${i + 1} aborted after ${TIMEOUT_MS / 1000}s timeout. Retrying...`);
            } else {
                console.error(`Fetch attempt ${i + 1} failed due to network error:`, error);
            }
            
            if (i < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                // If it was a network error/timeout and we hit max retries, re-throw the error
                throw new Error("Maximum retries reached for network request.");
            }
        }
    }
    // This line should technically be unreachable
    throw new Error("Exited retry loop unexpectedly.");
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
    const apiKey = process.env.FIRST_API_KEY; 
    
    // LOGGING ADDED: Check if the key was loaded. (The actual key is intentionally masked here)
    console.log(`API Key status: ${apiKey ? 'Loaded' : 'MISSING'}. Length: ${apiKey ? apiKey.length : 0}. If 403 persists, check key validity/restrictions.`);

    if (!apiKey) {
        console.error("FIRST_API_KEY environment variable is not set.");
        return {
            statusCode: 500,
            body: JSON.stringify({ message: "Server configuration error: API Key missing. Please set FIRST_API_KEY in Netlify environment variables." })
        };
    }

    // Use the stable GA model for Gemini 2.5 Flash
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

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

        // Call the Gemini API securely from the backend using retry logic
        const geminiResponse = await fetchWithRetry(API_URL, {
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
