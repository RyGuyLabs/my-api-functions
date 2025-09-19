// This is temporary code to find the correct model name
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fetch = require("node-fetch");

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
};

exports.handler = async (event) => {
    // Handle OPTIONS for CORS preflight
    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 204, headers: CORS_HEADERS };
    }

    const geminiApiKey = process.env.FIRST_API_KEY;

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${geminiApiKey}`;
        const response = await fetch(url);
        const data = await response.json();
        const availableModels = data.models.map(m => m.name);
        
        console.log("Available models:", JSON.stringify(availableModels));
        // 

        return {
            statusCode: 200,
            headers: CORS_HEADERS,
            body: JSON.stringify({ 
                message: "Successfully listed models. Check Netlify logs for the list.",
                models: availableModels
            })
        };
    } catch (error) {
        console.error("Error listing models:", error);
        return {
            statusCode: 500,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: "Failed to list models." })
        };
    }
};
