const { GoogleGenerativeAI } = require('@google/generative-ai');

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
};

exports.handler = async function (event, context) {
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
        const { action, base64Audio, prompt } = body;

        // Use the API key from your Netlify environment variables
        const apiKey = process.env.FIRST_API_KEY;

        if (!apiKey) {
            return {
                statusCode: 500,
                headers: CORS_HEADERS,
                body: JSON.stringify({ message: "API key is not set." }),
            };
        }

        const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
        const TTS_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`;

        if (action === 'generate_script') {
            const systemPrompt = "You are a world-class sales copywriter. Generate a concise, professional, and persuasive sales script for a new software product. The script should be suitable for a brief cold call or a short pitch. Focus on a clear problem-solution structure and a strong call to action.";
            const userQuery = "Generate a short sales script for software that helps small businesses manage their social media accounts more efficiently.";

            const payload = {
                contents: [{
                    parts: [{
                        text: userQuery
                    }]
                }],
                systemInstruction: {
                    parts: [{
                        text: systemPrompt
                    }]
                },
            };

            const response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const result = await response.json();
            const generatedScript = result.candidates[0].content.parts[0].text;
            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({
                    script: generatedScript
                }),
            };
        } else if (action === 'analyze_audio') {
            if (!base64Audio || !prompt) {
                return {
                    statusCode: 400,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ message: "Audio data or prompt is missing." })
                };
            }
            
            // --- MOCK TRANSCRIPTION ---
            const transcribedText = "Hello, my name is Alex from Tech Solutions. I'm calling about your social media management. Are you currently looking for a more efficient way to handle your marketing?";

            // --- ANALYSIS & TTS Generation ---
            const systemPrompt = `You are an expert vocal coach and sales strategist. Your task is to analyze a sales pitch transcript based on the user's vocal delivery. Provide feedback on the following aspects: persuasiveness, confidence, tone, pitch, and overall sales tact. Do not mention that this is a transcription and not real audio. The analysis should be direct and actionable. After the analysis, provide a one-sentence summary and a score out of 100. For example: "Overall, your pitch was strong, scoring an 85/100." The score should reflect all aspects of the analysis.`;
            const userQuery = `Analyze the following transcribed sales pitch: "${transcribedText}"`;

            const payload = {
                contents: [{
                    parts: [{
                        text: userQuery
                    }]
                }],
                generationConfig: {
                    responseModalities: ["AUDIO", "TEXT"],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: {
                                voiceName: "Puck"
                            }
                        }
                    }
                },
                model: "gemini-2.5-flash-preview-tts"
            };

            const response = await fetch(TTS_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const result = await response.json();
            const analysisText = result.candidates[0].content.parts[0].text;
            const audioData = result.candidates[0].content.parts[1].inlineData.data;

            // Extract the score from the analysis text
            const scoreMatch = analysisText.match(/(\d+)\/100/);
            const score = scoreMatch ? parseInt(scoreMatch[1]) : 'N/A';

            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({
                    analysis: analysisText,
                    score: score,
                    audioData: audioData
                }),
            };
        }

        return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({
                message: "Invalid action."
            }),
        };

    } catch (error) {
        console.error("Error:", error);
        return {
            statusCode: 500,
            headers: CORS_HEADERS,
            body: JSON.stringify({
                message: "An internal server error occurred.",
                error: error.message
            }),
        };
    }
};
