const { GoogleGenerativeAI } = require("@google/generative-ai");

/**
 * Main handler for the serverless function.
 * @param {object} event - The request event object.
 * @param {object} context - The context object.
 * @returns {object} The response object.
 */
exports.handler = async function(event, context) {
    // Set up CORS headers to allow requests from any origin.
    // This is crucial for a Squarespace site to communicate with this function.
    const headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*", // Or specify your Squarespace domain
        "Access-Control-Allow-Headers": "Content-Type"
    };

    // Handle preflight requests for CORS.
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                ...headers,
                "Access-Control-Allow-Methods": "POST"
            },
            body: ''
        };
    }

    // Ensure the request is a POST request.
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: "Method Not Allowed" })
        };
    }

    // Parse the request body.
    let requestBody;
    try {
        requestBody = JSON.parse(event.body);
    } catch (e) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: "Invalid JSON in request body." })
        };
    }

    const { prompt, text } = requestBody;

    // Validate the required parameters.
    if (!prompt || !text) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: "Missing 'prompt' or 'text' in request body." })
        };
    }

    const API_KEY = process.env.FIRST_API_KEY;
    if (!API_KEY) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "API key is not set." })
        };
    }

    const genAI = new GoogleGenerativeAI(API_KEY);
    // Use the correct model ID for Gemini 1.5 Flash.
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-preview-0520" });

    try {
        const result = await model.generateContent([
            `Task: Transform the following text based on the user's prompt.
            Prompt: ${prompt}
            Original Text: ${text}
            
            Transformed Text:`
        ]);

        const transformedText = result?.response?.text();

        if (!transformedText) {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: "API response was empty or malformed." })
            };
        }

        // Return the transformed text in a JSON object.
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ transformedText })
        };

    } catch (error) {
        console.error("API call failed:", error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "Failed to generate content from AI." })
        };
    }
};
