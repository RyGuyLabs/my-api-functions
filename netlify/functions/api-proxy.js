// This file acts as a serverless function to proxy requests to the Gemini API,
// ensuring your API key remains secure on the server side.
const fetch = require('node-fetch');

// Expose the handler function for Netlify
exports.handler = async function(event, context) {
    // Set CORS headers to allow all origins. This is necessary for the browser to
    // accept the response from the serverless function.
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    // Handle preflight OPTIONS request from the browser
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: headers,
            body: JSON.stringify({ message: "Preflight check passed." })
        };
    }

    // Ensure the request is a POST request
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: headers,
            body: JSON.stringify({ error: "Method Not Allowed" })
        };
    }

    try {
        const payload = JSON.parse(event.body);
        const feature = payload.feature;

        // The user's API key is stored securely as an environment variable in Netlify.
        // It's not exposed to the client-side.
        const apiKey = process.env.FIRST_API_KEY || "";
        console.log(`API Key Loaded: ${apiKey ? "Yes" : "No"}`);
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

        let geminiPayload;

        if (feature === "generate_text") {
            // Logic for generating new text for the user to read
            geminiPayload = {
                contents: [{
                    parts: [{ text: payload.prompt }]
                }]
            };
        } else if (feature === "vocal_coach") {
            // Logic for analyzing the vocal recording
            geminiPayload = {
                contents: [{
                    parts: [
                        { text: payload.prompt },
                        {
                            inlineData: {
                                mimeType: payload.mimeType,
                                data: payload.audio
                            }
                        }
                    ]
                }]
            };
        } else {
            return {
                statusCode: 400,
                headers: headers,
                body: JSON.stringify({ error: "Invalid feature requested." })
            };
        }

        // Call the Gemini API with the constructed payload
        const apiResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiPayload)
        });

        if (!apiResponse.ok) {
            const errorData = await apiResponse.json().catch(() => ({}));
            throw new Error(`Gemini API error: ${apiResponse.status} - ${errorData.error?.message || apiResponse.statusText}`);
        }

        const result = await apiResponse.json();
        const candidate = result.candidates?.[0];

        if (candidate && candidate.content?.parts?.[0]?.text) {
            let responseText = candidate.content.parts[0].text;

            if (feature === "vocal_coach") {
                // For the vocal coach, the model is configured to return a JSON string
                const feedback = JSON.parse(responseText.replace(/```json|```/g, ''));
                return {
                    statusCode: 200,
                    headers: headers,
                    body: JSON.stringify(feedback)
                };
            } else if (feature === "generate_text") {
                // For new text generation, return the text as is
                return {
                    statusCode: 200,
                    headers: headers,
                    body: JSON.stringify({ text: responseText })
                };
            }
        } else {
            throw new Error("Could not get a valid response from the Gemini API.");
        }
    } catch (error) {
        console.error("Serverless Function Error:", error);
        return {
            statusCode: 500,
            headers: headers,
            body: JSON.stringify({ error: `Internal Server Error: ${error.message}` })
        };
    }
};
