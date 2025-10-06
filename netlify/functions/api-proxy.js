const { GoogleGenerativeAI } = require('@google/generative-ai');

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
};

exports.handler = async function(event) {
    // Handle pre-flight OPTIONS requests for CORS
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: CORS_HEADERS,
            body: ''
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: "Method Not Allowed" })
        };
    }

    try {
        const body = JSON.parse(event.body);
        const { feature, userGoal, prompt } = body;
        
        const geminiApiKey = process.env.FIRST_API_KEY;

        if (!geminiApiKey || geminiApiKey.trim() === '') {
            console.error("Critical Error: FIRST_API_KEY environment variable is missing or empty.");
            return {
                statusCode: 500,
                headers: CORS_HEADERS,
                body: JSON.stringify({ message: 'API Key is not configured.' })
            };
        }
      
        const genAI = new GoogleGenerativeAI(geminiApiKey);
        const textModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        let finalResponseBody = {};

        switch (feature) {
            case "generate_text": {
                if (!prompt) {
                    return {
                        statusCode: 400,
                        headers: CORS_HEADERS,
                        body: JSON.stringify({ message: 'Missing "prompt" data for text generation.' })
                    };
                }
                const textResponse = await textModel.generateContent(prompt);
                finalResponseBody = { text: textResponse.response.text() };
                break;
            }

            case "plan":
            case "pep_talk":
            case "vision_prompt":
            case "obstacle_analysis":
            case "positive_spin":
            case "mindset_reset":
            case "objection_handler": {
                // The `userGoal` field is used for all these features.
                if (!userGoal) {
                    return {
                        statusCode: 400,
                        headers: CORS_HEADERS,
                        body: JSON.stringify({ message: 'Missing "userGoal" data.' })
                    };
                }

                let systemInstructionText = "";
                switch (feature) {
                    case "plan":
                        systemInstructionText = "You are a world-class life coach and project manager named RyGuy. Your tone is supportive, encouraging, and highly actionable. Provide a detailed, step-by-step, and actionable plan to achieve the user's goal. Break the plan into a maximum of 5 distinct, numbered steps. Use clear, simple language and bold keywords for emphasis. The plan should be easy to understand and follow.";
                        break;
                    case "pep_talk":
                        systemInstructionText = "You are a motivational speaker named RyGuy. Your tone is incredibly energetic, positive, and inspiring. Write a short, powerful pep talk for the user to help them achieve their goal. Use uplifting language and end with a strong, encouraging statement.";
                        break;
                    case "vision_prompt":
                        systemInstructionText = "You are an imaginative guide named RyGuy. Your tone is creative and vivid. Provide a descriptive, single-paragraph prompt for the user to help them visualize their goal. The prompt should be a powerful mental image they can use for a vision board or meditation. Focus on sensory details.";
                        break;
                    case "obstacle_analysis":
                        systemInstructionText = "You are a strategic consultant named RyGuy. Your tone is analytical and straightforward. Identify and describe a maximum of 3 potential obstacles or challenges the user might face in achieving their goal. For each obstacle, provide a practical, high-level solution or strategy to overcome it. Present this as a numbered list.";
                        break;
                    case "positive_spin":
                        systemInstructionText = "You are an optimistic reframer. Your tone is positive and encouraging. Take the user's negative statement and rewrite it to highlight the opportunities and strengths within it. Your output should be a single, concise paragraph.";
                        break;
                    case "mindset_reset":
                        systemInstructionText = "You are a pragmatic mindset coach named RyGuy. Your tone is direct, simple, and actionable. Provide a brief, powerful, and easy-to-follow mindset reset. Focus on shifting perspective from a problem to a solution. The response should be a single paragraph.";
                        break;
                    case "objection_handler":
                        systemInstructionText = "You are a professional sales trainer. Your tone is confident and strategic. Given a sales objection from the user, provide a structured, two-part response. First, acknowledge and validate the objection. Second, provide a concise, effective strategy to counter the objection. Your response should be a single paragraph.";
                        break;
                }

                const generalResponse = await textModel.generateContent({
                    contents: [{ parts: [{ text: userGoal }] }],
                    systemInstruction: { parts: [{ text: systemInstructionText }] }
                });
                finalResponseBody = { text: generalResponse.response.text() };
                break;
            }
          
            default:
                return {
                    statusCode: 400,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ message: `Invalid "feature" specified: ${feature}` })
                };
        }

        return {
            statusCode: 200,
            headers: CORS_HEADERS,
            body: JSON.stringify(finalResponseBody)
        };
    } catch (error) {
        console.error("Internal server error:", error);
        return {
            statusCode: 500,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: `Internal server error: ${error.message}` })
        };
    }
};


