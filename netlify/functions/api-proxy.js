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
        let response = null;
        let finalResponseBody;

        switch (feature) {
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
                response = await vocalCoachModel.generateContent([userGoal, audioPart]);
                
                // For vocal coach, we expect a JSON response
                try {
                    const responseText = response.response.text();
                    finalResponseBody = JSON.parse(responseText.replace(/```json/g, '').replace(/```/g, '').trim());
                } catch (jsonError) {
                    finalResponseBody = { text: "Error parsing vocal coach response." };
                }
                break;

            case "generate_text":
                const generateTextModel = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });
                response = await generateTextModel.generateContent(userGoal);
                finalResponseBody = { text: response.response.text() };
                break;
            
            case "positive_spin":
            case "mindset_reset":
            case "objection_handler":
            case "plan":
            case "pep_talk":
            case "vision_prompt":
            case "obstacle_analysis":
                const textOnlyModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                response = await textOnlyModel.generateContent(userGoal);
                finalResponseBody = { text: response.response.text() };
                break;
            
            default:
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ message: 'Invalid "feature" specified.' })
                };
        }

        if (response) {
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
