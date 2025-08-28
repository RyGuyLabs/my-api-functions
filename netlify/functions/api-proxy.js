import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch';

exports.handler = async function(event, context) {
    // Set CORS headers for all responses
    const headers = {
        'Access-Control-Allow-Origin': 'https://www.ryguylabs.com', // Replace with your exact Squarespace domain
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    };

    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }
   
    // Check for correct HTTP method
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ message: "Method Not Allowed" })
        };
    }

    try {
        const body = JSON.parse(event.body);
        const { feature, userGoal, textToSpeak } = body;

        if (!feature) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ message: 'Missing "feature" in request body.' })
            };
        }

        const genAI = new GoogleGenerativeAI(process.env.FIRST_API_KEY);
        let response = null;

        switch (feature) {
            case "plan":
                const planPrompt = `Create a highly actionable, detailed, and motivating step-by-step plan for the user's dream. Be specific and break it down into manageable tasks. Format the plan using clear headers and bullet points. The user's dream is: ${userGoal}`;
                const planModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                response = await planModel.generateContent(planPrompt);
                break;
            case "pep_talk":
                const pepTalkPrompt = `Write an extremely short, high-energy, and highly motivating pep talk for the user about their dream. It should be punchy and encouraging. The user's dream is: ${userGoal}`;
                const pepTalkModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                response = await pepTalkModel.generateContent(pepTalkPrompt);
                break;
            case "vision_prompt":
                const visionPromptPrompt = `Write a creative and vivid prompt for a vision board that will help the user visualize their dream. Focus on sensory details and strong imagery. The user's dream is: ${userGoal}`;
                const visionModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                response = await visionModel.generateContent(visionPromptPrompt);
                break;
            case "obstacle_analysis":
                const obstaclePrompt = `Provide a list of potential obstacles the user might encounter while pursuing their dream, and provide a single, concise strategy for overcoming each one. The user's dream is: ${userGoal}`;
                const obstacleModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                response = await obstacleModel.generateContent(obstaclePrompt);
                break;
            case "tts":
                if (!textToSpeak) {
                    return {
                        statusCode: 400,
                        headers,
                        body: JSON.stringify({ message: 'Missing "textToSpeak" for TTS request.' })
                    };
                }
                const elevenLabsResponse = await fetch('https://api.elevenlabs.io/v1/text-to-speech/21m00TzPtYqRk8iKq5Da', {
                    method: 'POST',
                    headers: {
                        'Accept': 'audio/mpeg',
                        'Content-Type': 'application/json',
                        'xi-api-key': process.env.ELEVENLABS_API_KEY
                    },
                    body: JSON.stringify({
                        text: textToSpeak,
                        model_id: "eleven_multilingual_v2",
                        voice_settings: {
                            stability: 0.5,
                            similarity_boost: 0.75
                        }
                    })
                });

                if (!elevenLabsResponse.ok) {
                    return {
                        statusCode: elevenLabsResponse.status,
                        headers,
                        body: JSON.stringify({ message: `ElevenLabs API error: ${elevenLabsResponse.statusText}` })
                    };
                }

                const audioBuffer = await elevenLabsResponse.buffer();
                const audioData = audioBuffer.toString('base64');
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({ audioData, mimeType: 'audio/mpeg' })
                };
            default:
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ message: 'Invalid "feature" specified.' })
                };
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ response: response.response })
        };
    } catch (error) {
        console.error("Internal server error:", error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ message: `Internal server error: ${error.message}` })
        };
    }
};
