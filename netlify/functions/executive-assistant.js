// Netlify Function to proxy requests to the Gemini API, protecting the API key.
// File must be deployed under netlify/functions/executive-assistant.js

const { GoogleGenAI } = require('@google/genai');

// The API Key MUST be set as a Netlify Environment Variable named FIRST_API_KEY
const apiKey = process.env.FIRST_API_KEY;

// NOTE: We no longer initialize GoogleGenAI globally. It is now initialized inside
// the handler to ensure the apiKey check runs first.
// const ai = new GoogleGenAI(apiKey); // <-- Removed this line

exports.handler = async (event) => {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: "Method Not Allowed. Use POST." }),
        };
    }

    // --- CRITICAL DEBUGGING CHECK ---
    // If the API key is missing, return a detailed error.
    if (!apiKey || apiKey.trim() === '') {
        const errorMsg = "CRITICAL: The FIRST_API_KEY environment variable is missing or empty in Netlify settings.";
        console.error(errorMsg);
        
        // Return a specific 500 status to the client
        return {
            statusCode: 500,
            body: JSON.stringify({ 
                error: "Server Configuration Error: API key is missing.",
                log_message: errorMsg,
                // Include this hint for the client
                hint: "Please check your Netlify environment variables for FIRST_API_KEY." 
            }),
        };
    }

    // Initialize the GoogleGenAI client here, ensuring we have a valid apiKey.
    let ai;
    try {
        ai = new GoogleGenAI(apiKey);
    } catch (sdkError) {
        console.error("Failed to initialize GoogleGenAI SDK:", sdkError);
        return {
            statusCode: 500,
            body: JSON.stringify({ 
                error: "SDK Initialization Failure.", 
                message: sdkError.message 
            }),
        };
    }


    try {
        const { model, payload } = JSON.parse(event.body);

        if (!model || !payload || !payload.contents) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: "Missing required fields: model or payload (including contents)." }),
            };
        }
        
        // This is the call that uses the SDK which was initialized with the apiKey
        const response = await ai.models.generateContent({
            model: model,
            contents: payload.contents,
            config: payload.generationConfig,
            tools: payload.tools,
            systemInstruction: payload.systemInstruction
        });

        // The response structure from the SDK is slightly different from the REST API
        // We ensure we send back a structure the client expects
        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(response),
        };

    } catch (error) {
        console.error("Gemini API Call Failed:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ 
                error: "Internal Gemini API Error", 
                message: error.message 
            }),
        };
    }
};
