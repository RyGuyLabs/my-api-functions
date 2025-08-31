import { GoogleGenerativeAI } from "@google/generative-ai";

// Standard headers for CORS (Cross-Origin Resource Sharing).
const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
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
        const body = JSON.parse(event.body);
        const { feature, userGoal } = body;

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
                body: JSON.stringify({ message: 'API Key is not configured.' })
            };
        }
      
        const genAI = new GoogleGenerativeAI(geminiApiKey);
        let finalResponseBody = null;

        const textOnlyModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                
        let systemInstructionText = "";
        if (!userGoal) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ message: 'Missing "userGoal" data.' })
            };
        }

        switch (feature) {
            case "positive_spin":
                systemInstructionText = "You are a sales coach. Reframe a user's negative thought or challenge into a positive, empowering sales-oriented mindset. Keep the response concise and action-focused.";
                break;
            case "mindset_reset":
                systemInstructionText = "You are a sales coach. Provide a short, actionable strategy to help a user reset their mindset after a difficult sales call or day.";
                break;
            case "objection_handler":
                systemInstructionText = "You are a sales expert. Take a user's stated customer objection and provide a clear, empathetic, and persuasive response to handle it effectively.";
                break;
            case "plan":
                systemInstructionText = "You are a strategic sales planner. Take a user's high-level goal and break it down into a simple, three-step action plan to achieve it. Use bullet points for each step.";
                break;
            case "pep_talk":
                systemInstructionText = "You are an encouraging mentor. Provide a brief, uplifting pep talk to motivate a user. The tone should be inspiring and positive.";
                break;
            case "vision_prompt":
                systemInstructionText = "You are a visionary coach. Prompt the user with a powerful, forward-looking question to help them visualize their future success.";
                break;
            case "obstacle_analysis":
                systemInstructionText = "You are a problem-solving analyst. Help the user break down a single sales-related obstacle into its core components to find a solution.";
                break;
          
            default:
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ message: 'Invalid "feature" specified.' })
                };
        }

        try {
            const generalResponse = await textOnlyModel.generateContent({
                contents: [{ parts: [{ text: userGoal }] }],
                systemInstruction: { parts: [{ text: systemInstructionText }] }
            });
            finalResponseBody = { text: generalResponse.response.text() };
        } catch (apiError) {
            console.error("Text generation API call error:", apiError);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ message: `Failed to get response: ${apiError.message}` })
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
