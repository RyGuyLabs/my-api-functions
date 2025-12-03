const { GoogleGenerativeAI } = require('@google/generative-ai');

// Setting the maximum allowed request body size to 4.5 MB. 
// Netlify's limit is 6MB. We use a safety margin to prevent a 502 error 
// caused by the gateway rejecting an oversized payload.
const MAX_PAYLOAD_SIZE_BYTES = 4.5 * 1024 * 1024; 

// --- NEW: SCHEMA DEFINITION FOR AUDIO ANALYSIS ---
const AUDIO_ANALYSIS_SCHEMA = {
    type: "OBJECT",
    properties: {
        score: {
            type: "INTEGER",
            description: "A numerical score (0-100) assessing the vocal delivery.",
        },
        transcript: {
            type: "STRING",
            description: "The complete, cleaned text transcript of the audio.",
        },
        analysis: {
            type: "STRING",
            description: "A detailed, markdown-formatted report on pacing, tone, and confidence.",
        },
        actionable_feedback: {
            type: "STRING",
            description: "3-5 specific, clear bullet points for immediate improvement.",
        },
    },
    required: ["score", "transcript", "analysis", "actionable_feedback"],
};
// ------------------------------------------------

const CORS_HEADERS = {
    // REVISED: Using '*' to prevent CORS issues on different deployment environments
    'Access-Control-Allow-Origin': '*', 
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin', 
};

exports.handler = async (event) => {
    // Handle preflight OPTIONS request for CORS
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: CORS_HEADERS, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers: CORS_HEADERS, body: 'Method Not Allowed' };
    }

    // --- CRITICAL NEW CHECK: Detect and block overly large payloads before JSON parsing ---
    if (event.body && event.body.length > MAX_PAYLOAD_SIZE_BYTES) {
        console.error(`Payload size (${event.body.length} bytes) exceeds limit.`);
        return {
            statusCode: 413, // Standard HTTP code for Payload Too Large
            headers: CORS_HEADERS,
            body: JSON.stringify({ 
                error: "Audio file is too large.",
                detail: `The maximum file size allowed is 4.5 MB. Please record a shorter message.`
            }),
        };
    }
    // --- END CRITICAL NEW CHECK ---
    
    try {
        const body = JSON.parse(event.body);
        const { action, base64Audio, prompt, mimeType } = body;

        const apiKey = process.env.FIRST_API_KEY;
        if (!apiKey) {
            console.error("API Key (FIRST_API_KEY) is not set in environment variables.");
            return {
                statusCode: 500,
                headers: CORS_HEADERS,
                body: JSON.stringify({ error: "Server configuration error: API key missing." }),
            };
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        
        if (action === 'generate_script') {
            const textModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

            const prompts = [
                "Speak like you're inspiring a team to reach their monthly goals.",
                "Deliver a short pitch about the importance of customer empathy.",
                "Recite a 15-word motivational message for a cold-calling sales rep.",
                "Speak a one-liner that could close a deal on the spot.",
                "Say something that would boost a discouraged teammate's confidence.",
                "Create a 10-15 word pitch introducing yourself and your company.",
                "Share a quick elevator pitch that excites a potential client.",
                "Speak a phrase that sounds confident, encouraging, and assertive.",
                "Say something that communicates leadership in less than 20 words.",
                "Deliver a sentence that would energize a sales team in the morning."
            ];

            const promptText = "Generate only the requested short, professional speech/pitch. " + 
                              prompts[Math.floor(Math.random() * prompts.length)];

            try {
                const result = await textModel.generateContent(promptText);
                const script = (await result.response.text()).trim();

                return {
                    statusCode: 200,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ script: script }),
                };
            } catch (apiError) {
                console.error("Error during script generation:", apiError);
                return {
                    statusCode: 500,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ error: "Failed to generate script from AI model." }),
                };
            }
        }

        if (action === 'analyze_audio') {
            const audioModel = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

            if (!base64Audio || !prompt || !mimeType) {
                return {
                    statusCode: 400,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ error: "Missing required fields for audio analysis." }),
                };
            }

            const systemInstruction = `
You are a vocal coach and sales communication expert. Analyze a user reading a short sales script.
... [system instruction redacted for brevity] ...
`;

            const payload = {
                contents: [
                    {
                        role: "user",
                        parts: [
                            { text: prompt },
                            {
                                inlineData: {
                                    mimeType: mimeType,
                                    data: base64Audio,
                                },
                            },
                        ],
                    },
                ],
                systemInstruction: {
                    parts: [{ text: systemInstruction }],
                },
            };
            
            try {
                let result;
                const MAX_RETRIES = 3;
                // Exponential backoff retry logic
                for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
                    try {
                        // REVISED: Pass responseMimeType and responseSchema to guarantee JSON output
                        result = await audioModel.generateContent({
                            ...payload,
                            config: {
                                responseMimeType: "application/json",
                                responseSchema: AUDIO_ANALYSIS_SCHEMA,
                            }
                        });
                        break; // Success! Exit loop
                    } catch (e) {
                        if (e.status === 503 && attempt < MAX_RETRIES - 1) {
                            const delay = Math.pow(2, attempt) * 1000;
                            await new Promise(resolve => setTimeout(resolve, delay));
                            continue; // Continue to the next attempt
                        }
                        throw e; 
                    }
                }
                
                const responseText = (await result.response.text()).trim();

                // REMOVED: Markdown cleaning is no longer needed since JSON output is guaranteed
                const feedback = JSON.parse(responseText);
                
                return {
                    statusCode: 200,
                    headers: CORS_HEADERS,
                    body: JSON.stringify(feedback),
                };
            } catch (jsonOrApiError) {
                console.error("Error during audio analysis (AI response/API error):", jsonOrApiError);
                return {
                    statusCode: 500,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({
                        error: "Failed to process audio analysis or model response.",
                        detail: (jsonOrApiError.message || "Unknown API/JSON failure").substring(0, 100) + "...",
                    }),
                };
            }
        }

        return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: "Invalid action specified." }),
        };

    } catch (error) {
        // CATCH-ALL BLOCK: Ensures all fatal errors return a clean, CORS-compliant response
        console.error("Top-level function error:", error);
        return {
            statusCode: 500,
            headers: CORS_HEADERS,
            body: JSON.stringify({ 
                error: "An unexpected top-level server error occurred.", 
                detail: error.stack || error.message 
            }),
        };
    }
};
