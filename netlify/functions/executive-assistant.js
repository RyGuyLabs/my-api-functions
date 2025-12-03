// Netlify Function to proxy requests to the Gemini API, protecting the API key.
// File must be deployed under netlify/functions/executive-assistant.js

const { GoogleGenAI } = require('@google/genai');

// The API Key MUST be set as a Netlify Environment Variable named FIRST_API_KEY
const apiKey = process.env.FIRST_API_KEY;

exports.handler = async (event) => {
    
    // Log the incoming request details for debugging
    console.log(`Received request from origin: ${event.headers.origin}`);
    console.log(`HTTP Method: ${event.httpMethod}`);

    // --- 1. Define Global CORS Headers (FIX APPLIED HERE) ---
    // TEMPORARY FIX: Setting to '*' to allow requests from any origin (e.g., localhost, staging, sandboxes)
    // If running in production, replace '*' with your specific production URL(s).
    const CORS_HEADERS = {
        // FIX: Broaden the CORS policy to temporarily resolve 403 issues caused by origin mismatch.
        'Access-Control-Allow-Origin': '*', // Changed from 'https://www.ryguylabs.com'
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        // Critical: Allow the Content-Type and the custom header X-Gemini-Model.
        'Access-Control-Allow-Headers': 'Content-Type, X-Gemini-Model',
    };

    // --- 2. Handle the OPTIONS Preflight Request ---
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: "CORS preflight check successful." }),
        };
    }

    // --- 3. Enforce POST Method ---
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: "Method Not Allowed. Use POST." }),
        };
    }
    
    // --- CRITICAL DEBUGGING CHECK ---
    if (!apiKey || apiKey.trim() === '') {
        const errorMsg = "CRITICAL: The FIRST_API_KEY environment variable is missing or empty in Netlify settings.";
        console.error(errorMsg);
        
        return {
            statusCode: 500,
            headers: CORS_HEADERS,
            body: JSON.stringify({ 
                error: "Server Configuration Error: API key is missing.",
                log_message: errorMsg,
                hint: "Please check your Netlify environment variables for FIRST_API_KEY." 
            }),
        };
    }

    // Initialize the GoogleGenAI client
    let ai;
    try {
        ai = new GoogleGenAI({ apiKey: apiKey });
    } catch (sdkError) {
        console.error("Failed to initialize GoogleGenAI SDK:", sdkError);
        return {
            statusCode: 500,
            headers: CORS_HEADERS,
            body: JSON.stringify({ 
                error: "SDK Initialization Failure.", 
                message: sdkError.message 
            }),
        };
    }


    try {
        const body = JSON.parse(event.body);
        
        // --- Read the custom header 'X-Gemini-Model' for the correct model name ---
        // Netlify downcases custom headers, so check for 'x-gemini-model'.
        const modelFromHeader = event.headers['x-gemini-model'];

        // REVISED: Fallback model updated to the stable alias to prevent future retirement errors.
        const actualModel = modelFromHeader || body.model || 'gemini-2.5-flash';

        // Destructure the rest of the configuration from the body.
        const { contents, tools, systemInstruction, generationConfig } = body;
        
        console.log(`Using model: ${actualModel}`);
        console.log("Incoming request body (parsed):", body);
        
        // New validation check
        if (!contents || !Array.isArray(contents) || contents.length === 0) {
            return {
                statusCode: 400,
                headers: CORS_HEADERS,
                body: JSON.stringify({ error: "Missing required field: contents array in request body." }),
            };
        }
        
        // This is the call that uses the SDK which was initialized with the apiKey
        const response = await ai.models.generateContent({
            model: actualModel,
            contents: contents,
            config: generationConfig, 
            tools: tools,
            systemInstruction: systemInstruction
        });

        // --- 4. Success Response: Merge Content-Type and CORS Headers ---
        return {
            statusCode: 200,
            headers: { 
                "Content-Type": "application/json",
                ...CORS_HEADERS
            },
            body: JSON.stringify(response),
        };

    } catch (error) {
        console.error("Gemini API Call Failed:", error);
        // Include the error from the Google API or other internal crashes
        return {
            statusCode: 500,
            headers: CORS_HEADERS,
            body: JSON.stringify({ 
                error: "Internal Gemini API Error", 
                message: error.message 
            }),
        };
    }
};
