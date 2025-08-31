// This file acts as a serverless function to proxy requests to the Gemini API,
// ensuring your API key remains secure on the server side.
// It uses the native fetch API to avoid module loading errors.

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

    // Ensure the request is a POST request
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
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
        
        let geminiPayload;
        let model;
        let systemInstruction;

        switch (feature) {
            case "generate_text":
                model = "gemini-1.0-pro";
                geminiPayload = {
                    contents: [{
                        parts: [{ text: payload.prompt }]
                    }]
                };
                break;
            case "vocal_coach":
                model = "gemini-1.5-pro-latest";
                systemInstruction = {
                    parts: [{
                        text: "You are a professional vocal coach. Your goal is to provide concise, structured, and encouraging feedback on a user's vocal performance. Analyze their tone based on the goals of being confident, calm, and persuasive. Format your response as a JSON object with a score from 1-100 for confidence and clarity, a 1-2 sentence summary, and bullet points for strengths, improvements, and next steps."
                    }]
                };
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
                    }],
                    systemInstruction,
                    generationConfig: {
                        responseMimeType: "application/json"
                    }
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
                    headers,
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
            
            // Check if the feature is the vocal coach before attempting JSON parsing.
            if (feature === "vocal_coach") {
                try {
                    const feedback = JSON.parse(responseText.replace(/```json|```/g, ''));
                    return {
                        statusCode: 200,
                        headers,
                        body: JSON.stringify(feedback)
                    };
                } catch (jsonError) {
                    console.error("JSON parsing error for vocal coach:", jsonError);
                    return {
                        statusCode: 500,
                        headers,
                        body: JSON.stringify({ error: `Internal Server Error: Failed to parse vocal coach feedback.` })
                    };
                }
            } else {
                // Return text as is for all other features.
                return {
                    statusCode: 200,
                    headers,
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
            headers,
            body: JSON.stringify({ error: `Internal Server Error: ${error.message}` })
        };
    }
};
