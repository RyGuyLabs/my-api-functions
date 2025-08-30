import { GoogleGenerativeAI } from "@google/generative-ai";

// Standard headers for CORS (Cross-Origin-Resource Sharing).
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
        });
    }

    try {
        const body = JSON.parse(event.body);
        const { feature, prompt, audio, mimeType, userGoal } = body;

        if (!feature) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ message: 'Missing "feature" in request body.' })
            };
        }

        const geminiApiKey = process.env.FIRST_API_KEY;

        if (!geminiApiKey || geminiApiKey.trim() === '') {
            console.error("Critical Error: FIRST_API_KEY environment variable is missing or empty.");
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ message: 'API Key is not configured. Please set the FIRST_API_KEY environment variable in Netlify.' })
            };
        }

        const genAI = new GoogleGenerativeAI(geminiApiKey);
        let finalResponseBody = null;

        switch (feature) {
            case "vocal_coach":
                if (!audio || !prompt || !mimeType) {
                    return {
                        statusCode: 400,
                        headers,
                        body: JSON.stringify({ message: 'Missing "audio", "prompt", or "mimeType" data for vocal coach.' })
                    };
                }

                try {
                    const vocalCoachModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

                    const generationConfig = {
                        responseMimeType: "application/json",
                    };
                    
                    const audioPart = {
                        inlineData: {
                            data: audio,
                            mimeType: mimeType,
                        },
                    };

                    const result = await vocalCoachModel.generateContent({
                        contents: [
                            {
                                parts: [
                                    { text: prompt },
                                    audioPart
                                ]
                            }
                        ],
                        generationConfig: generationConfig,
                    });

                    const responseText = result.response?.text();
                    finalResponseBody = JSON.parse(responseText);

                } catch (apiError) {
                    console.error("API call or JSON parsing error:", apiError);
                    return {
                        statusCode: 500,
                        headers,
                        body: JSON.stringify({ message: `Failed to get vocal coach feedback: ${apiError.message}` })
                    };
                }
                break;
            
            case "generate_text":
                if (!prompt) {
                    return {
                        statusCode: 400,
                        headers,
                        body: JSON.stringify({ message: 'Missing "prompt" data for text generation.' })
                    };
                }
                const generateTextModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                const textResponse = await generateTextModel.generateContent(prompt);
                finalResponseBody = { text: textResponse.response.text() };
                break;
            
            case "positive_spin":
            case "mindset_reset":
            case "objection_handler":
            case "plan":
            case "pep_talk":
            case "vision_prompt":
            case "obstacle_analysis":
                const textOnlyModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                const generalResponse = await textOnlyModel.generateContent(userGoal);
                finalResponseBody = { text: generalResponse.response.text() };
                break;
            
            default:
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ message: 'Invalid "feature" specified.' })
                };
        }

        if (finalResponseBody) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(finalResponseBody)
            };
        } else {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ message: "An unexpected error occurred." })
            };
        }
    } catch (error) {
        console.error("Internal server error:", error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ message: `Internal server error: ${error.message}` })
        });
    }
};
