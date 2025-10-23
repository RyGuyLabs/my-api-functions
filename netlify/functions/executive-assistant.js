// Netlify Function to proxy requests to the Gemini API, protecting the API key.
// File must be deployed under netlify/functions/executive-assistant.js

const { GoogleGenAI } = require('@google/genai');

// The API Key MUST be set as a Netlify Environment Variable named FIRST_API_KEY
const apiKey = process.env.FIRST_API_KEY;

exports.handler = async (event) => {

    // --- 1. Define Global CORS Headers ---
    // These headers must be included in ALL responses (OPTIONS, POST, and errors).
    const CORS_HEADERS = {
        // FIX: Replacing the wildcard '*' with the specific origin URL for stricter security.
        'Access-Control-Allow-Origin': 'https://www.ryguylabs.com',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        // Critical: Allow the Content-Type and any custom headers (like X-Gemini-Model).
        'Access-Control-Allow-Headers': 'Content-Type, X-Gemini-Model',
    };

    // --- 2. Handle the OPTIONS Preflight Request ---
    // The browser sends this first to check permissions. We must respond with 200 OK.
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: "CORS preflight check successful." }),
        };
    }

    // --- 3. Enforce POST Method (Now handles everything else) ---
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: CORS_HEADERS, // Include CORS headers even on error responses
            body: JSON.stringify({ error: "Method Not Allowed. Use POST." }),
        };
    }
    
    // The remaining logic only runs for POST requests
    
    // --- CRITICAL DEBUGGING CHECK ---
    if (!apiKey || apiKey.trim() === '') {
        const errorMsg = "CRITICAL: The FIRST_API_KEY environment variable is missing or empty in Netlify settings.";
        console.error(errorMsg);
        
        return {
            statusCode: 500,
            headers: CORS_HEADERS, // Include CORS headers
            body: JSON.stringify({ 
                error: "Server Configuration Error: API key is missing.",
                log_message: errorMsg,
                hint: "Please check your Netlify environment variables for FIRST_API_KEY." 
            }),
        };
    }

    // Initialize the GoogleGenAI client here, ensuring we have a valid apiKey.
    let ai;
    try {
        // FIX APPLIED: The SDK was mistakenly attempting to load Google Cloud credentials 
        // (getApplicationDefaultAsync) because the API key was not passed in the 
        // explicit configuration object. This change forces it to use the provided key.
        ai = new GoogleGenAI({ apiKey: apiKey });
    } catch (sdkError) {
        console.error("Failed to initialize GoogleGenAI SDK:", sdkError);
        return {
            statusCode: 500,
            headers: CORS_HEADERS, // Include CORS headers
            body: JSON.stringify({ 
                error: "SDK Initialization Failure.", 
                message: sdkError.message 
            }),
        };
    }


    try {
        const body = JSON.parse(event.body);
        
        // --- DEBUGGING ADDITION: Log the incoming request body to Netlify logs ---
        console.log("Incoming request body (parsed):", body);
        // --------------------------------------------------------------------------
        
        // FIX: Extract fields directly from the root of the body, as shown in the logs.
        // If 'model' is missing (which the logs suggest), we use a strong default.
        const { contents, tools, systemInstruction, generationConfig, model } = body;
        
        // Use the model from the body if present, otherwise use the stable default
        const actualModel = model || 'gemini-2.5-flash-preview-09-2025';


        // New validation check based on the actual request structure
        if (!contents || !Array.isArray(contents) || contents.length === 0) {
            return {
                statusCode: 400,
                headers: CORS_HEADERS, // Include CORS headers
                body: JSON.stringify({ error: "Missing required field: contents array in request body." }),
            };
        }
        
        // This is the call that uses the SDK which was initialized with the apiKey
        const response = await ai.models.generateContent({
            model: actualModel, // Use the provided or default model
            contents: contents,
            config: generationConfig, // Now correctly pulling from root
            tools: tools,
            systemInstruction: systemInstruction // Now correctly pulling from root
        });

        // --- 4. Success Response: Merge Content-Type and CORS Headers ---
        return {
            statusCode: 200,
            headers: { 
                "Content-Type": "application/json",
                ...CORS_HEADERS // Merge the CORS headers here
            },
            body: JSON.stringify(response),
        };

    } catch (error) {
        console.error("Gemini API Call Failed:", error);
        return {
            statusCode: 500,
            headers: CORS_HEADERS, // Include CORS headers
            body: JSON.stringify({ 
                error: "Internal Gemini API Error", 
                message: error.message 
            }),
        };
    }
};
