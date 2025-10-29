const { GoogleGenerativeAI } = require('@google/generative-ai');
const fetch = require('node-fetch'); // NOTE: Make sure 'node-fetch' is available in your Netlify environment or dependencies.

// List of features that perform text streaming
const STREAMING_FEATURES = [
    "plan", "pep_talk", "vision_prompt", "obstacle_analysis", 
    "positive_spin", "mindset_reset", "objection_handler", 
    "smart_goal_structuring" // <-- Added S.M.A.R.T. Goal Structuring
];

// Map feature types to system instructions
const SYSTEM_INSTRUCTIONS = {
    // ... (System instructions remain the same) ...
    "plan": "You are a world-class life coach and project manager named RyGuy. Your tone is supportive, encouraging, and highly actionable. Provide a detailed, step-by-step, and actionable plan to achieve the user's goal. Break the plan into a maximum of 5 distinct, numbered steps. Use clear, simple language and bold keywords for emphasis. The plan should be easy to understand and follow.",
    "pep_talk": "You are a motivational speaker named RyGuy. Your tone is incredibly energetic, positive, and inspiring. Write a short, powerful pep talk for the user to help them achieve their goal. Use uplifting language and end with a strong, encouraging statement.",
    "vision_prompt": "You are an imaginative guide named RyGuy. Your tone is creative and vivid. Provide a descriptive, single-paragraph prompt for the user to help them visualize their goal. The prompt should be a powerful mental image they can use for a vision board or meditation. Focus on sensory details.",
    "obstacle_analysis": "You are a strategic consultant named RyGuy. Your tone is analytical and straightforward. Identify and describe a maximum of 3 potential obstacles or challenges the user might face in achieving their goal. For each obstacle, provide a practical, high-level solution or strategy to overcome it. Present this as a numbered list.",
    "positive_spin": "You are an optimistic reframer. Your tone is positive and encouraging. Take the user's negative statement and rewrite it to highlight the opportunities and strengths within it. Your output should be a single, concise paragraph.",
    "mindset_reset": "You are a pragmatic mindset coach named RyGuy. Your tone is direct, simple, and actionable. Provide a brief, powerful, and easy-to-follow mindset reset. Focus on shifting perspective from a problem to a solution. The response should be a single paragraph.",
    "objection_handler": "You are a professional sales trainer. Your tone is confident and strategic. Given a sales objection from the user, provide a structured, two-part response. First, acknowledge and validate the objection. Second, provide a concise, effective strategy to counter the objection. Your response should be a single paragraph.",
    "smart_goal_structuring": "You are a highly analytical goal-setting specialist named RyGuy. Your tone is precise, professional, and results-oriented. Take the user's goal and restructure it immediately into the five components of the S.M.A.R.T. framework (Specific, Measurable, Achievable, Relevant, Time-bound). Present the output as a numbered list where each number is the S.M.A.R.T. category name in bold, followed by a concise, structured breakdown of the user's goal based on that criterion." // <-- Added S.M.A.R.T. instruction
};


const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Transfer-Encoding': 'chunked', 
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
    
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const textModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    try {
        const body = JSON.parse(event.body);
        const { feature, userGoal, textToSpeak, stream, imagePrompt } = body;

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
            // Use the predict endpoint for Imagen 3.0
            const IMAGEN_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGEN_MODEL}:predict?key=${geminiApiKey}`;

            const imagenPayload = {
                instances: [{
                    prompt: imagePrompt,
                }],
                parameters: {
                    sampleCount: 1, // Generate one image
                    aspectRatio: "1:1", // Square image
                    outputMimeType: "image/png" // Ensure PNG output
                }
            };

            const response = await fetch(IMAGEN_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(imagenPayload)
            });

            if (!response.ok) {
                const errorBody = await response.text();
                console.error("Imagen API Error:", errorBody);
                throw new Error(`Imagen API failed with status ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            
            // Expected path: result.predictions[0].bytesBase64Encoded
            const base64Data = result?.predictions?.[0]?.bytesBase64Encoded;

            if (!base64Data) {
                console.error("Imagen API Response Missing Data:", JSON.stringify(result));
                throw new Error("Imagen API response did not contain image data.");
            }
            
            // Return the base64 data as a data URI for the frontend's <img> tag
            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({ 
                    imageUrl: `data:image/png;base64,${base64Data}`,
                    altText: `Generated vision for: ${imagePrompt}`
                })
            };
        }
        
        // --- 2. Handle Text Generation (Streaming or Non-Streaming) ---
        if (STREAMING_FEATURES.includes(feature) || feature === 'tts') {
            const goalText = userGoal || textToSpeak;
            if (!goalText) {
                return {
                    statusCode: 400,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ message: 'Missing required text data for feature.' })
                };
            }

            const systemInstructionText = SYSTEM_INSTRUCTIONS[feature];
            const generationConfig = {
                systemInstruction: { parts: [{ text: systemInstructionText }] }
            };
            const contents = [{ parts: [{ text: goalText }] }];

            // A. Non-Streaming Path (used for TTS)
            if (feature === 'tts' || !stream) {
                // NOTE: TTS feature is currently UNIMPLEMENTED (requires separate API). 
                // Returning a mock response for now, but keeping the logic structured.
                if (feature === 'tts') {
                    return {
                        statusCode: 200,
                        headers: CORS_HEADERS,
                        body: JSON.stringify({ 
                            audioData: 'mock_base64_audio_data_for_tts',
                            mimeType: 'audio/L16;rate=24000'
                        })
                    };
                }
                
                // Fallback for non-streaming text
                const response = await textModel.generateContent({ contents, ...generationConfig });
                return {
                    statusCode: 200,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ text: response.response.text() })
                };
            }

            // B. Streaming Path (for all text features except TTS)
            const streamResponse = await textModel.generateContentStream({ contents, ...generationConfig });
            let fullText = "";

            // The code below collects the full text before sending it, simulating a stream 
            // due to Netlify function limitations on true real-time streaming.
            for await (const chunk of streamResponse) {
                const chunkText = chunk.text;
                if (chunkText) {
                    fullText += chunkText;
                }
            }

            return {
                statusCode: 200,
                headers: {
                    ...CORS_HEADERS,
                    'Content-Type': 'application/json' 
                },
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
