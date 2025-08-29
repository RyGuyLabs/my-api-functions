import { GoogleGenerativeAI } from "@google/generative-ai";

exports.handler = async function(event, context) {
    const headers = {
        'Access-Control-Allow-Origin': 'https://www.ryguylabs.com',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    };

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
        const body = JSON.parse(event.body);
        const { feature, userGoal, audio, prompt } = body; 

        if (!feature) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ message: 'Missing "feature" in request body.' })
            };
        }

        const geminiApiKey = process.env.FIRST_API_KEY;
        if (!geminiApiKey) {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ message: 'Missing API Key.' })
            };
        }

        const genAI = new GoogleGenerativeAI(geminiApiKey);
        let finalResponseBody = null;
        let responseText = null;

        switch (feature) {
            case "vocal_coach":
                if (!audio || !prompt) {
                    return {
                        statusCode: 400,
                        headers,
                        body: JSON.stringify({ message: 'Missing "audio" or "prompt" data for vocal coach.' })
                    };
                }
                try {
                    const vocalCoachModel = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });
                    const audioPart = {
                        inlineData: {
                            data: audio,
                            mimeType: 'audio/webm',
                        },
                    };
                    const vocalCoachResponse = await vocalCoachModel.generateContent([prompt, audioPart]);
                    
                    // Safely get the text, and return an error if it's missing.
                    responseText = vocalCoachResponse.response?.text();
                    if (!responseText) {
                         return {
                             statusCode: 500,
                             headers,
                             body: JSON.stringify({ message: "API returned no text." })
                         };
                    }

                    // Attempt to parse the JSON and catch any errors.
                    finalResponseBody = JSON.parse(responseText.replace(/```json/g, '').replace(/```/g, '').trim());
                } catch (jsonError) {
                    console.error("Error parsing vocal coach response:", jsonError);
                    console.log("Original response text:", responseText);
                    
                    // Return a proper 500 error on parsing failure.
                    return {
                        statusCode: 500,
                        headers,
                        body: JSON.stringify({ message: `Internal server error: Failed to parse API response as JSON.` })
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
                const generateTextModel = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });
                const textResponse = await generateTextModel.generateContent(prompt);
                finalResponseBody = { text: textResponse.response.text() };
                break;
            
            // Your existing cases are kept here and will work as before
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
        };
    }
};
