// This is temporary code to find the correct model name
// File: netlify/functions/lead-qualifier.js
const { GoogleGenerativeAI } = require("@google/generative-ai");

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
};

const geminiApiKey = process.env.FIRST_API_KEY;
const genAI = new GoogleGenerativeAI(geminiApiKey);

exports.handler = async (event) => {
    // Handle OPTIONS for CORS preflight
    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 204, headers: CORS_HEADERS };
    }

    try {
        const modelList = await genAI.listModels();
        const availableModels = modelList.models.map(m => m.name);
        console.log("Available models:", JSON.stringify(availableModels));

        return {
            statusCode: 200,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: "Successfully listed models. Check Netlify logs for the list." })
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
