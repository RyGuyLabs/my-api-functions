const { GoogleGenerativeAI } = require('@google/generative-ai');
const fetch = require('node-fetch');

// List of features that perform text generation
const TEXT_GENERATION_FEATURES = [
    "plan", "pep_talk", "vision_prompt", "obstacle_analysis", 
    "positive_spin", "mindset_reset", "objection_handler", 
    "smart_goal_structuring"
];

// Map feature types to system instructions
const SYSTEM_INSTRUCTIONS = {
    "plan": "You are a world-class life coach named RyGuy. Your tone is supportive, encouraging, and highly actionable. Provide a detailed plan to achieve the user's goal in natural, polished paragraph form. Separate each step with a blank line. Avoid any symbols, lists, quotes, or code formatting. Deliver the output as clean, raw text suitable for direct display.",
    "pep_talk": "You are a motivational speaker named RyGuy. Your tone is energetic, inspiring, and positive. Write a short, powerful pep talk to help the user achieve their goal. Use uplifting, encouraging language. Separate sentences naturally, avoid quotes, symbols, or code formatting, and deliver the output as raw text.",
    "vision_prompt": "You are an imaginative guide named RyGuy. Your tone is vivid and creative. Provide a single-paragraph prompt that helps the user visualize their goal. Include sensory details to make the image clear and inspiring. Avoid quotes, symbols, or code formatting. Deliver as raw text.",
    "obstacle_analysis": "You are a strategic consultant named RyGuy. Your tone is analytical and practical. Identify up to three potential obstacles the user might face and provide a paragraph for each with practical strategies to overcome them. Separate each obstacle paragraph with a blank line. Avoid lists, symbols, quotes, or code formatting. Deliver as raw text.",
    "positive_spin": "You are an optimistic reframer named RyGuy. Your tone is positive and encouraging. Take the user's negative statement and rewrite it in a single paragraph that highlights opportunities and strengths. Avoid quotes, symbols, or code formatting. Deliver as raw text.",
    "mindset_reset": "You are a pragmatic mindset coach named RyGuy. Your tone is direct and actionable. Provide a brief, practical mindset reset in one paragraph. Focus on shifting perspective from a problem to a solution. Avoid lists, symbols, quotes, or code formatting. Deliver as raw text.",
    "objection_handler": "You are a professional sales trainer named RyGuy. Your tone is confident and strategic. Respond to a sales objection in a single paragraph that first acknowledges the objection and then provides a concise, effective strategy to address it. Avoid lists, symbols, quotes, or code formatting. Deliver as raw text.",
    "smart_goal_structuring": "You are a highly analytical goal-setting specialist named RyGuy. Your tone is professional and precise. Take the user's goal and restructure it according to the five S.M.A.R.T. criteria in polished paragraph form. For each category (Specific, Measurable, Achievable, Relevant, Time-bound), write a separate paragraph. Separate paragraphs with blank lines. Avoid lists, symbols, quotes, or code formatting. Deliver as raw text."
};

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json' 
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

    // --- API Key and Initialization ---
    const geminiApiKey = process.env.FIRST_API_KEY;
    if (!geminiApiKey || geminiApiKey.trim() === '') {
        return {
            statusCode: 500,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: 'API Key is not configured.' })
        };
    }
    
    // Note: We only initialize the standard text model here, not the full service, 
    // because the TTS model is called via a dedicated HTTP endpoint below.
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const textModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    try {
        const body = JSON.parse(event.body);
        const { feature, userGoal, textToSpeak, imagePrompt } = body;

        // --- 1. Handle Image Generation (Non-Streaming: Imagen 3.0) ---
        if (feature === 'image_generation') {
            if (!imagePrompt) {
                return {
                    statusCode: 400,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ message: 'Missing "imagePrompt" data for image generation.' })
                };
            }
            
            const IMAGEN_MODEL = "imagen-3.0-generate-002";
            const IMAGEN_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGEN_MODEL}:predict?key=${geminiApiKey}`;

            const imagenPayload = {
                instances: [{ prompt: imagePrompt }],
                parameters: {
                    sampleCount: 1, 
                    aspectRatio: "1:1",
                    outputMimeType: "image/png"
                }
            };

            const response = await fetch(IMAGEN_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(imagenPayload)
            });

            if (!response.ok) {
                const errorBody = await response.text();
                console.error("Imagen API Error:", errorBody);
                throw new Error(`Imagen API failed with status ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            const base64Data = result?.predictions?.[0]?.bytesBase64Encoded;

            if (!base64Data) {
                console.error("Imagen API Response Missing Data:", JSON.stringify(result));
                throw new Error("Imagen API response did not contain image data.");
            }
            
            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({ 
                    imageUrl: `data:image/png;base64,${base64Data}`,
                    altText: `Generated vision for: ${imagePrompt}`
                })
            };
        }
        
        // --- 2. Handle TTS Generation (Non-Streaming: gemini-2.5-flash-preview-tts) ---
        if (feature === 'tts') {
            if (!textToSpeak) {
                return {
                    statusCode: 400,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ message: 'Missing required text data for TTS.' })
                });
            }

            const TTS_MODEL = "gemini-2.5-flash-preview-tts";
            const TTS_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent?key=${geminiApiKey}`;

            // We use the "Kore" voice, which has a firm, professional sound.
            const ttsPayload = {
                contents: [{ parts: [{ text: textToSpeak }] }],
                generationConfig: {
                    responseModalities: ["AUDIO"],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: { voiceName: "Kore" } 
                        }
                    }
                }
            };

            const response = await fetch(TTS_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(ttsPayload)
            });

            if (!response.ok) {
                const errorBody = await response.text();
                console.error("TTS API Error:", errorBody);
                throw new Error(`TTS API failed with status ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            const part = result?.candidates?.[0]?.content?.parts?.find(
                p => p.inlineData && p.inlineData.mimeType.startsWith('audio/')
            );
            
            const audioData = part?.inlineData?.data;
            const mimeType = part?.inlineData?.mimeType;

            if (!audioData || !mimeType) {
                console.error("TTS API Response Missing Audio Data:", JSON.stringify(result));
                throw new Error("TTS API response did not contain audio data.");
            }

            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({ 
                    audioData: audioData,
                    mimeType: mimeType
                })
            };
        }

        // --- 3. Handle Text Generation ---
        if (TEXT_GENERATION_FEATURES.includes(feature)) {
            if (!userGoal) {
                return {
                    statusCode: 400,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ message: 'Missing required userGoal data for feature.' })
                };
            }

            const systemInstructionText = SYSTEM_INSTRUCTIONS[feature];
            const generationConfig = {
                systemInstruction: { parts: [{ text: systemInstructionText }] }
            };
            const contents = [{ parts: [{ text: userGoal }] }];

            // NOTE: The Firebase/Gemini SDK is used for text generation here.
            const response = await textModel.generateContent({ contents, ...generationConfig });
            const fullText = response.response.text();
            
            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({ text: fullText })
            };
        }

        // --- Default Case ---
        return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: `Invalid "feature" specified: ${feature}` })
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
