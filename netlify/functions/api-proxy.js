// This serverless function acts as a unified proxy for multiple AI-powered features.
// It handles API calls for text generation, audio analysis, and more, based on a 'feature' parameter.

// Standard headers for CORS (Cross-Origin Resource Sharing).
const headers = {
    'Access-Control-Allow-Origin': 'https://www.ryguylabs.com',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
};

// Define API URLs and the environment variable key for security and organization.
const API_URL_TEXT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${process.env.FIRST_API_KEY}`;
const API_URL_TTS = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${process.env.FIRST_API_KEY}`;
const API_URL_1_0_PRO = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.0-pro:generateContent?key=${process.env.FIRST_API_KEY}`;
const API_URL_1_5_FLASH = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.FIRST_API_KEY}`;

// Helper function to handle fetch calls with error handling
async function callGeminiAPI(url, payload) {
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error?.message || "Gemini API call failed.");
        }
        return result;
    } catch (error) {
        throw new Error(`API call error: ${error.message}`);
    }
}

// Prompt templates for the "Dream Planner" features to ensure unique responses
const promptTemplates = {
    "positive_spin": "Take the following user goal or statement and reframe it with a positive, uplifting spin. The focus should be on an opportunity for growth and success, not a problem: ",
    "mindset_reset": "Provide a quick, empowering, and actionable mindset reset based on the following challenge or thought: ",
    "objection_handler": "Act as a sales expert. Provide a confident and effective way to handle the following objection: ",
    "plan": "Help me create a detailed, step-by-step plan to achieve the following goal. The plan should be highly actionable and easy to follow: ",
    "pep_talk": "Deliver a short, motivational pep talk based on the following challenge: ",
    "vision_prompt": "Expand on the following idea to help me build a clearer, more inspiring vision for my project or life. Use vivid language: ",
    "obstacle_analysis": "Analyze the following obstacle and break down potential solutions and a clear path forward. Focus on practical, creative ways to overcome it: "
};


exports.handler = async (event, context) => {
    // Handle pre-flight OPTIONS requests for CORS.
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
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
        const { feature, userGoal, audio, prompt, mimeType } = body;

        if (!feature) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ message: 'Missing "feature" in request body.' })
            };
        }

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

                // The system instruction gives the model a clear role and persona.
                const systemInstruction = "You are a professional vocal coach. Your goal is to provide concise, structured, and encouraging feedback on a user's vocal performance. Analyze their tone based on the goals of being confident, calm, and persuasive. Format your response as a JSON object with a score from 1-100 for confidence and clarity, a 1-2 sentence summary, and bullet points for strengths, improvements, and next steps.";

                const vocalCoachPayload = {
                    contents: [{
                        parts: [
                            { text: prompt },
                            { inlineData: { data: audio, mimeType: mimeType } }
                        ]
                    }],
                    systemInstruction: { parts: [{ text: systemInstruction }] },
                    generationConfig: { responseMimeType: "application/json" }
                };

                const vocalCoachResult = await callGeminiAPI(API_URL_1_5_FLASH, vocalCoachPayload);
                const responseText = vocalCoachResult?.candidates?.[0]?.content?.parts?.[0]?.text;

                if (!responseText) {
                    throw new Error("Failed to get analysis from Gemini.");
                }

                try {
                    finalResponseBody = JSON.parse(responseText);
                } catch (parseError) {
                    throw new Error(`Failed to parse Gemini response: ${parseError.message}`);
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
                const textResult = await callGeminiAPI(API_URL_1_0_PRO, { contents: [{ parts: [{ text: prompt }] }] });
                finalResponseBody = { text: textResult?.candidates?.[0]?.content?.parts?.[0]?.text };
                break;

            case "positive_spin":
            case "mindset_reset":
            case "objection_handler":
            case "plan":
            case "pep_talk":
            case "vision_prompt":
            case "obstacle_analysis":
                // All "Dream Planner" features
                if (!userGoal) {
                    return {
                        statusCode: 400,
                        headers,
                        body: JSON.stringify({ message: 'Missing "userGoal" data for Dream Planner feature.' })
                    };
                }
                
                // Use a specific prompt template based on the feature
                const dreamPlannerPrompt = promptTemplates[feature] + userGoal;

                const generalResult = await callGeminiAPI(API_URL_1_5_FLASH, { contents: [{ parts: [{ text: dreamPlannerPrompt }] }] });
                finalResponseBody = { text: generalResult?.candidates?.[0]?.content?.parts?.[0]?.text };
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
