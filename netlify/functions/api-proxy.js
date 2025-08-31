// This file acts as a serverless function to proxy requests to the Gemini API,
// ensuring your API key remains secure on the server side.
// It uses the native fetch API to avoid module loading errors.

// This file is now configured to work with the Netlify.toml file.
// All CORS headers are handled by Netlify's server.

// Gemini API URLs
const API_URL_TEXT_FLASH = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=`;
const API_URL_TTS = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=`;

exports.handler = async function(event) {
    // Handle pre-flight OPTIONS requests for CORS.
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            body: ''
        };
    }

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
        if (!apiKey) {
            throw new Error("API key not configured in environment variables.");
        }
        
        let geminiPayload;
        let model;

        switch (feature) {
            case "generate_text":
                model = "gemini-2.5-flash-preview-05-20";
                const textPrompt = "Please write a concise, one-paragraph text (around 30-40 words) for a professional to read. The text should be suitable for a sales pitch, job interview, or a professional presentation, and should be designed to be read with a confident, calm, and persuasive tone.";

                geminiPayload = {
                    contents: [{
                        parts: [{ text: textPrompt }]
                    }]
                };
                
                // Call the Gemini API with the constructed payload
                const genTextResponse = await fetch(`${API_URL_TEXT_FLASH}${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(geminiPayload)
                });

                if (!genTextResponse.ok) {
                    const errorData = await genTextResponse.json().catch(() => ({}));
                    throw new Error(`Gemini API error: ${genTextResponse.status} - ${errorData.error?.message || genTextResponse.statusText}`);
                }

                const genTextResult = await genTextResponse.json();
                const generatedText = genTextResult?.candidates?.[0]?.content?.parts?.[0]?.text;

                if (!generatedText) {
                    throw new Error("Could not get a valid response for text generation.");
                }
                
                return {
                    statusCode: 200,
                    body: JSON.stringify({ text: generatedText.trim() })
                };

            case "vocal_coach":
                model = "gemini-2.5-flash-preview-05-20";
                const { audio, mimeType, prompt } = payload;
                
                // Call Gemini to get the analysis (score and text)
                const textPayload = {
                    contents: [{
                        role: "user",
                        parts: [
                            { text: prompt },
                            {
                                inlineData: {
                                    mimeType: mimeType,
                                    data: audio
                                }
                            }
                        ]
                    }],
                    generationConfig: {
                         responseMimeType: "application/json"
                    },
                };

                const textResponse = await fetch(`${API_URL_TEXT_FLASH}${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(textPayload)
                });

                const textResult = await textResponse.json();
                const analysisText = textResult?.candidates?.[0]?.content?.parts?.[0]?.text;
                
                if (!analysisText) {
                    throw new Error("Failed to get analysis from Gemini.");
                }

                // Clean the text by removing markdown code fences before parsing
                const cleanedAnalysisText = analysisText.replace(/```json|```/g, '').trim();
                const feedback = JSON.parse(cleanedAnalysisText);

                return {
                    statusCode: 200,
                    body: JSON.stringify(feedback)
                };
            case "positive_spin":
            case "mindset_reset":
            case "objection_handler":
            case "plan":
            case "pep_talk":
            case "vision_prompt":
            case "obstacle_analysis":
                model = "gemini-2.5-flash-preview-05-20";
                geminiPayload = {
                    contents: [{
                        parts: [{ text: payload.userGoal }]
                    }]
                };
                
                const otherFeatureResponse = await fetch(`${API_URL_TEXT_FLASH}${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(geminiPayload)
                });

                if (!otherFeatureResponse.ok) {
                    const errorData = await otherFeatureResponse.json().catch(() => ({}));
                    throw new Error(`Gemini API error: ${otherFeatureResponse.status} - ${errorData.error?.message || otherFeatureResponse.statusText}`);
                }

                const otherFeatureResult = await otherFeatureResponse.json();
                const otherFeatureText = otherFeatureResult?.candidates?.[0]?.content?.parts?.[0]?.text;
                
                return {
                    statusCode: 200,
                    body: JSON.stringify({ text: otherFeatureText })
                };

            default:
                return {
                    statusCode: 400,
                    body: JSON.stringify({ error: "Invalid feature requested." })
                };
        }
    } catch (error) {
        console.error("Serverless Function Error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: `Internal Server Error: ${error.message}` })
        };
    }
};
