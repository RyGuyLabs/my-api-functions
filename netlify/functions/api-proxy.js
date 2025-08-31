// This file acts as a serverless function to proxy requests to the Gemini API,
// ensuring your API key remains secure on the server side.
const fetch = require('node-fetch');

// Expose the handler function for Netlify
exports.handler = async function(event, context) {
    // Netlify will handle CORS headers based on the _headers file, so they are not set here.
    
    // Ensure the request is a POST request
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: "Method Not Allowed" })
        };
    }

    try {
        const payload = JSON.parse(event.body);
        const feature = payload.feature;

        // The user's API key is stored securely as an environment variable in Netlify.
        // It's not exposed to the client-side.
        const apiKey = process.env.FIRST_API_KEY || "";
        console.log(`API Key Loaded: ${apiKey ? "Yes" : "No"}`); // This will help with debugging
        
        let geminiPayload;
        let model;

        switch (feature) {
            case "generate_text":
                // Logic for generating new text for the user to read
                model = "gemini-1.0-pro";
                geminiPayload = {
                    contents: [{
                        parts: [{ text: payload.prompt }]
                    }]
                };
                break;
            case "vocal_coach":
                // Using the Flash model which is compatible with your API key
                model = "gemini-1.5-flash-preview-05-20";
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
                break;
            case "positive_spin":
            case "mindset_reset":
            case "objection_handler":
            case "plan":
            case "pep_talk":
            case "vision_prompt":
            case "obstacle_analysis":
                model = "gemini-1.5-flash";
                geminiPayload = {
                    contents: [{
                        parts: [{ text: payload.userGoal }]
                    }]
                };
                break;
            default:
                return {
                    statusCode: 400,
                    body: JSON.stringify({ error: "Invalid feature requested." })
                };
        }

        // Call the Gemini API with the constructed payload and the correct model URL
        const apiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
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
                    body: JSON.stringify(feedback)
                };
            } else {
                // For all other features, return the text as is
                return {
                    statusCode: 200,
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
            body: JSON.stringify({ error: `Internal Server Error: ${error.message}` })
        };
    }
};
