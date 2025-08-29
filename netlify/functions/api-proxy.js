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
        // Corrected: Added 'audio' to destructuring
        const { feature, userGoal, audio } = body; 

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

        switch (feature) {
            // New case for vocal coach
            case "vocal_coach":
                if (!audio) {
                    return {
                        statusCode: 400,
                        headers,
                        body: JSON.stringify({ message: 'Missing "audio" data for vocal coach.' })
                    };
                }
                const vocalCoachModel = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });
                const audioPart = {
                    inlineData: {
                        data: audio,
                        mimeType: 'audio/webm',
                    },
                };
                const vocalCoachResponse = await vocalCoachModel.generateContent([userGoal, audioPart]);
                
                try {
                    const responseText = vocalCoachResponse.response.text();
                    // Correctly parse the JSON response from the model
                    finalResponseBody = JSON.parse(responseText.replace(/```json/g, '').replace(/```/g, '').trim());
                } catch (jsonError) {
                    finalResponseBody = { text: "Error parsing vocal coach response." };
                }
                break;
            
            // New case for generating text
            case "generate_text":
                const generateTextModel = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });
                const textResponse = await generateTextModel.generateContent(userGoal);
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

        // Corrected: The final return statement is now universal
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
