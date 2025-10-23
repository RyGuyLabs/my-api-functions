// Netlify Function to proxy requests to the Gemini API, protecting the API key.
// File must be deployed under netlify/functions/executive-assistant.js

const { GoogleGenAI } = require('@google/genai');

// The API Key MUST be set as a Netlify Environment Variable named FIRST_API_KEY
const apiKey = process.env.FIRST_API_KEY;

// Initialize the GoogleGenAI client (this is the recommended way to use the API in Node.js environments)
const ai = new GoogleGenAI(apiKey);

exports.handler = async (event) => {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: "Method Not Allowed. Use POST." }),
        };
    }

    if (!apiKey) {
        console.error("FIRST_API_KEY environment variable is not set.");
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Server Configuration Error: API key (FIRST_API_KEY) is missing." }),
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
        
        // Use the appropriate API method based on the model.
        // gemini-2.5-flash-preview-tts needs generateContent
        // The text models also use generateContent
        
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
                error: "Internal API Error", 
                message: error.message 
            }),
        };
    }
};
