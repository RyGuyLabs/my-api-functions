import fetch from 'node-fetch';

// Standard headers for CORS (Cross-Origin Resource Sharing).
const headers = {
    'Access-Control-Allow-Origin': 'https://www.ryguylabs.com',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
};

exports.handler = async function(event) {
    // Handle pre-flight OPTIONS requests for CORS.
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ message: "Method Not Allowed" })
        };
    }

    try {
        const payload = JSON.parse(event.body);
        const apiKey = process.env.FIRST_API_KEY;

        if (!apiKey || apiKey.trim() === '') {
            console.error("Critical Error: FIRST_API_KEY environment variable is missing or empty.");
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ message: 'API Key is not configured. Please set the FIRST_API_KEY environment variable in Netlify.' })
            };
        }

        const model = payload.model;
        const contents = payload.contents;
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const apiPayload = {
            contents: contents,
            generationConfig: payload.generationConfig || {},
            systemInstruction: payload.systemInstruction || {}
        };
        
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(apiPayload)
        });

        const data = await response.json();

        return {
            statusCode: response.status,
            headers,
            body: JSON.stringify(data)
        };
    } catch (error) {
        console.error("Internal server error:", error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ message: `Internal server error: ${error.message}` })
        };
    }
};
