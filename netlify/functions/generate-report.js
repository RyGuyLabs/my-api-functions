/**
 * Serverless function to handle content generation using the Gemini API.
 * It dynamically configures the request based on the user's selected 'taskMode'.
 * This file is intended to be deployed as a Netlify Function or similar serverless environment.
 */
// In a real environment, the API key should be loaded from secure environment variables.
// The Canvas environment automatically provides the API key to the fetch call, so we leave it as an empty string.
const API_KEY = ""; 
const MODEL_NAME = "gemini-2.5-flash-preview-09-2025";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}`;
const MAX_RETRIES = 5;

// --- Helper Functions ---

// Exponential backoff retry for API call
const fetchWithRetry = async (url, options) => {
    for (let i = 0; i < MAX_RETRIES; i++) {
        try {
            const response = await fetch(url, options);
            if (response.ok) {
                return response;
            }
            // If the response is not OK (e.g., 500, 429), retry with delay
            const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
        } catch (error) {
            // For network errors, retry with delay
            const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
            if (i < MAX_RETRIES - 1) {
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                // On the last attempt, re-throw the error
                throw new Error('Gemini API request failed after multiple retries.');
            }
        }
    }
    throw new Error('Gemini API request failed due to unknown persistent error.');
};

// Function to configure the model based on the user's selected task mode
const getModelConfig = (taskMode) => {
    const config = {
        tools: [],
        systemInstruction: ""
    };

    switch (taskMode) {
        case 'report':
            config.systemInstruction = "Act as a professional, factual, and detailed research analyst. Generate a comprehensive report based on the user query.";
            config.tools = [{ "google_search": {} }]; // Use Search Grounding
            break;
        case 'summary':
            config.systemInstruction = "Act as a concise and precise executive summary writer. Extract only the key findings and deliver them in a structured, easy-to-read list format, followed by a brief overall conclusion.";
            config.tools = [{ "google_search": {} }]; // Use Search Grounding
            break;
        case 'brainstorm':
            config.systemInstruction = "Act as a creative and imaginative ideation specialist. Generate innovative concepts and ideas in a freeform, engaging manner. Do not use external search tools.";
            // tools remain empty, disabling search grounding
            break;
        default:
            // Default safe mode if taskMode is unrecognized
            config.systemInstruction = "You are a helpful and detailed assistant. Provide a clear response.";
            config.tools = [{ "google_search": {} }];
            break;
    }

    // Tools property should only be included if it has contents
    if (config.tools.length === 0) {
        delete config.tools;
    }
    
    return config;
};

// --- Main Handler Function ---

/**
 * Netlify Function handler.
 * @param {object} event - The event object from the serverless environment.
 */
exports.handler = async (event) => {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    let body;
    try {
        body = JSON.parse(event.body);
    } catch (e) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Invalid JSON body' }) };
    }

    const { query, taskMode } = body;

    if (!query) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Query parameter is missing' }) };
    }

    const modelConfig = getModelConfig(taskMode);

    const payload = {
        contents: [{ parts: [{ text: query }] }],
        ...modelConfig // Spreads systemInstruction and optionally tools
    };

    try {
        const response = await fetchWithRetry(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        const candidate = result.candidates?.[0];

        if (candidate && candidate.content?.parts?.[0]?.text) {
            const text = candidate.content.parts[0].text;
            let sources = [];
            
            // Extract grounding sources if available
            const groundingMetadata = candidate.groundingMetadata;
            if (groundingMetadata && groundingMetadata.groundingAttributions) {
                sources = groundingMetadata.groundingAttributions
                    .map(attribution => ({
                        uri: attribution.web?.uri,
                        title: attribution.web?.title,
                    }))
                    .filter(source => source.uri && source.title);
            }

            // Return success response to the client
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, sources })
            };
        } else {
            // Handle cases where the API call succeeded but returned no text content
            const errorMessage = "Gemini returned a response, but it contained no text.";
            console.error(errorMessage, result);
            return {
                statusCode: 500,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: errorMessage })
            };
        }

    } catch (error) {
        console.error("Gemini API Error:", error.message);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: `Failed to communicate with the Gemini API: ${error.message}` })
        };
    }
};
