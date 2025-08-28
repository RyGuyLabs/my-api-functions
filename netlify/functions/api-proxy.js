import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch';

exports.handler = async function(event, context) {
    // 1. Define the headers object at the top.
    const headers = {
        'Access-Control-Allow-Origin': 'https://www.ryguylabs.com',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type' // Add Content-Type here
    };

    // 2. Handle the OPTIONS preflight request.
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: '' // An empty body is fine here
        };
    }

    // 3. Handle the main POST request.
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers, // Make sure to include the headers here too
            body: JSON.stringify({ message: "Method Not Allowed" })
        };
    }

    try {
        const body = JSON.parse(event.body);
        const { feature, userGoal, textToSpeak } = body;

        // ... rest of your code ...

        // Your Gemini and ElevenLabs calls remain the same.
        // It's important that your final response also includes the headers.
        
        // Example for the Gemini cases:
        if (response) {
            return {
                statusCode: 200,
                headers, // Add the headers here
                body: JSON.stringify({ response: response.response })
            };
        }

        // Example for the TTS case:
        return {
            statusCode: 200,
            headers, // And here
            body: JSON.stringify({ audioData, mimeType: 'audio/mpeg' })
        };

    } catch (error) {
        console.error("Internal server error:", error);
        return {
            statusCode: 500,
            headers, // And here for error responses
            body: JSON.stringify({ message: `Internal server error: ${error.message}` })
        };
    }
};
