import { GoogleGenerativeAI } from "@google/generative-ai";

exports.handler = async function(event, context) {
    // 1. Define the headers object at the top.
    const headers = {
        'Access-Control-Allow-Origin': 'https://www.ryguylabs.com',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    };

    // 2. Handle the OPTIONS preflight request.
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    // 3. Handle the main POST request.
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
        if (!geminiApiKey) {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ message: 'Missing API Key.' })
            };
        }

        const genAI = new GoogleGenerativeAI(geminiApiKey);
        let response = null;

        switch (feature) {
            case "plan":
                const planModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                response = await planModel.generateContent(`Create a highly actionable, detailed, and motivating step-by-step plan for the user's dream. Be specific and break it down into manageable tasks. Format the plan using clear headers and bullet points. The user's dream is: ${userGoal}`);
                break;
            case "pep_talk":
                const pepTalkModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                response = await pepTalkModel.generateContent(`Write an extremely short, high-energy, and highly motivating pep talk for the user about their dream. It should be punchy and encouraging. The user's dream is: ${userGoal}`);
                break;
            case "vision_prompt":
                const visionModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                response = await visionModel.generateContent(`Write a creative and vivid prompt for a vision board that will help the user visualize their dream. Focus on sensory details and strong imagery. The user's dream is: ${userGoal}`);
                break;
            case "obstacle_analysis":
                const obstacleModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                response = await obstacleModel.generateContent(`Provide a list of potential obstacles the user might encounter while pursuing their dream, and provide a single, concise strategy for overcoming each one. The user's dream is: ${userGoal}`);
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
                body: JSON.stringify({ response: response.response })
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
