/**
 * Netlify Function to securely proxy calls to the Google Generative Language API.
 * * This function handles both text generation (gemini-2.5-flash-preview-09-2025)
 * and TTS generation (gemini-2.5-flash-preview-tts) by using the environment variable
 * FIRST_API_KEY for authentication.
 */

const fetch = require('node-fetch');

// The main handler for the Netlify Function
exports.handler = async (event, context) => {
    // Check if the request is a POST request
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method Not Allowed. Only POST requests are accepted.' })
        };
    }

    // Check for the API key in Netlify's environment variables
    const apiKey = process.env.FIRST_API_KEY;
    if (!apiKey) {
        console.error('API Key Error: FIRST_API_KEY environment variable is not set.');
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Server configuration error: API key missing.' })
        };
    }

    // Parse the incoming request body from the client (which contains the model and its specific payload)
    let clientData;
    try {
        clientData = JSON.parse(event.body);
    } catch (e) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Invalid JSON format in request body.' })
        };
    }

    const { model, payload } = clientData;

    if (!model || !payload) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Missing required fields: "model" and "payload" are required.' })
        };
    }

    // Construct the correct Google API URL
    // All current models used in the app use the :generateContent endpoint.
    const googleApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    console.log(`Proxying request for model: ${model}`);

    try {
        const response = await fetch(googleApiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Google API does not require Authorization header if key is in URL
            },
            body: JSON.stringify(payload)
        });

        // Forward the response status and body from the Google API back to the client
        const responseBody = await response.json();

        return {
            statusCode: response.status,
            body: JSON.stringify(responseBody),
            // Ensure CORS is set correctly for client-side JS calls
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            }
        };

    } catch (error) {
        console.error('Proxy Fetch Error:', error);
        return {
            statusCode: 502, // Bad Gateway
            body: JSON.stringify({ 
                error: 'Failed to connect to the Google Generative Language API.', 
                details: error.message 
            })
        };
    }
};
