const { GoogleGenerativeAI } = require('@google/generative-ai');

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
};

exports.handler = async function(event) {
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
        const { action, base64Audio, prompt, mimeType } = body;
        
        // Use the API key from your Netlify environment variables
        const apiKey = process.env.FIRST_API_KEY;

        if (!apiKey) {
            return {
                statusCode: 500,
                headers: CORS_HEADERS,
                body: JSON.stringify({ message: "API key is not set." }),
            };
        }

        if (action === 'generate_script') {
            const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
            
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

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = errorData.message || response.statusText;
                throw new Error(`API error: ${response.status} - ${errorMessage}`);
            }

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
            
            const genAI = new GoogleGenerativeAI(apiKey);
            
            const vocalCoachModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-05-20" });

            const systemInstruction = "You are a professional sales vocal coach. Provide concise, structured, and encouraging feedback on a user's vocal performance. Analyze their tone, confidence, persuasiveness, and enunciation. Your response MUST be a single JSON object with a score (1-100) and a detailed analysis.";
            
            const generationConfig = {
                responseMimeType: "application/json",
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        "summary": { "type": "STRING" },
                        "score": {
                            "type": "OBJECT",
                            "properties": {
                                "confidence": { "type": "NUMBER" },
                                "clarity": { "type": "NUMBER" }
                            }
                        },
                        "strengths": {
                            "type": "ARRAY",
                            "items": { "type": "STRING" }
                        },
                        "improvements": {
                            "type": "ARRAY",
                            "items": { "type": "STRING" }
                        },
                        "nextSteps": { "type": "STRING" }
                    }
                }
            };

            const audioPart = {
                inlineData: {
                    data: base64Audio,
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
                systemInstruction: { parts: [{ text: systemInstruction }] },
                generationConfig: generationConfig,
            });

            const responseText = result.response?.text();
            const finalResponseBody = JSON.parse(responseText);
            
            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify(finalResponseBody)
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
