const { GoogleAuth } = require('google-auth-library');
const { v4: uuidv4 } = require('uuid');

const auth = new GoogleAuth({
    scopes: 'https://www.googleapis.com/auth/cloud-platform'
});

async function makeApiCall(apiPath, method, body, additionalHeaders = {}) {
    const client = await auth.getClient();
    const headers = {
        'Content-Type': 'application/json',
        ...additionalHeaders
    };
    
    // Check if the body needs to be stringified
    const requestBody = body instanceof Object ? JSON.stringify(body) : body;

    const res = await client.request({
        url: `https://generativelanguage.googleapis.com/v1beta/${apiPath}`,
        method: method,
        headers: headers,
        body: requestBody,
    });
    return res.data;
}

exports.handler = async (event, context) => {
    // Set CORS headers for all responses
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST'
    };

    // Handle OPTIONS preflight request
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: headers
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: 'Method Not Allowed'
        };
    }

    try {
        const payload = JSON.parse(event.body);
        const { feature, prompt, audio, mimeType, voice } = payload;

        let result;

        switch (feature) {
            case 'vocal_coach':
                const audioContent = [{
                    audioData: audio,
                    mimeType: mimeType
                }];
                const textContent = [{
                    text: `Analyze the user's audio pitch. Compare it to the provided prompt text: "${prompt}". Provide a score from 1-100 based on pace, clarity, and tone. Then, provide a detailed analysis in a conversational, positive tone. The output should be a single JSON object with two fields: "score" (an integer) and "analysis" (a string). Do not include any other text.`
                }];
                const geminiPayload = {
                    contents: [{
                        parts: [
                            ...textContent,
                            ...audioContent
                        ]
                    }],
                    generationConfig: {
                        responseMimeType: "application/json",
                        responseSchema: {
                            type: "OBJECT",
                            properties: {
                                "score": { "type": "INTEGER" },
                                "analysis": { "type": "STRING" }
                            },
                            "propertyOrdering": ["score", "analysis"]
                        }
                    },
                };
                
                result = await makeApiCall('models/gemini-1.5-pro-preview-0514:generateContent', 'POST', geminiPayload);
                const geminiResponse = JSON.parse(result.candidates[0].content.parts[0].text);
                return {
                    statusCode: 200,
                    headers: headers,
                    body: JSON.stringify(geminiResponse)
                };
                
            case 'generate_text':
                const textGenerationPayload = {
                    contents: [{
                        parts: [{ text: prompt }]
                    }]
                };
                result = await makeApiCall('models/gemini-1.5-pro-preview-0514:generateContent', 'POST', textGenerationPayload);
                return {
                    statusCode: 200,
                    headers: headers,
                    body: JSON.stringify({ text: result.candidates[0].content.parts[0].text })
                };

            case 'tts':
                const ttsPayload = {
                    contents: [{
                        parts: [{ text: prompt }]
                    }],
                    generationConfig: {
                        responseModality: ["AUDIO"],
                        speechConfig: {
                            voiceConfig: {
                                prebuiltVoiceConfig: { voiceName: voice || "Kore" }
                            }
                        }
                    },
                    model: "gemini-2.5-flash-preview-tts"
                };
                result = await makeApiCall('models/gemini-2.5-flash-preview-tts:generateContent', 'POST', ttsPayload);
                const audioData = result?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
                const mimeTypeTts = result?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.mimeType;

                if (!audioData || !mimeTypeTts) {
                    throw new Error("Invalid TTS response from API.");
                }

                return {
                    statusCode: 200,
                    headers: headers,
                    body: JSON.stringify({ audioData: audioData, mimeType: mimeTypeTts })
                };
            
            // Your existing features
            case 'dream_planner':
                // Your existing code for the dream planner goes here.
                return {
                    statusCode: 200,
                    headers: headers,
                    body: JSON.stringify({ message: "Dream planner feature is active." })
                };
            case 'positive_spin':
                // Your existing code for the positive spin feature goes here.
                return {
                    statusCode: 200,
                    headers: headers,
                    body: JSON.stringify({ message: "Positive spin feature is active." })
                };
            case 'mindset_reset':
                // Your existing code for the mindset reset feature goes here.
                return {
                    statusCode: 200,
                    headers: headers,
                    body: JSON.stringify({ message: "Mindset reset feature is active." })
                };
            case 'objection_handler':
                // Your existing code for the objection handler feature goes here.
                return {
                    statusCode: 200,
                    headers: headers,
                    body: JSON.stringify({ message: "Objection handler feature is active." })
                };

            default:
                return {
                    statusCode: 400,
                    headers: headers,
                    body: JSON.stringify({ error: 'Invalid feature requested.' })
                };
        }
    } catch (error) {
        console.error("API Error:", error);
        return {
            statusCode: 500,
            headers: headers,
            body: JSON.stringify({ error: error.message || 'An unknown error occurred.' })
        };
    }
};
