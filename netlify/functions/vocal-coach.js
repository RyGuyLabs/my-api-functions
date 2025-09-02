const { GoogleGenerativeAI } = require('@google/generative-ai');

exports.handler = async (event) => {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const body = JSON.parse(event.body);
        const { action, base64Audio, prompt, mimeType } = body;

        // Ensure the API key environment variable is set
        const apiKey = process.env.FIRST_API_KEY;
        if (!apiKey) {
            console.error("API key is not set in environment variables.");
            return {
                statusCode: 500,
                body: JSON.stringify({ error: "API key is not configured." }),
            };
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

        if (action === 'generate_script') {
            // Logic to generate a new script
            const scriptPrompt = "Generate a single, short, encouraging, and inspirational sentence for a salesperson to use as a vocal exercise. Keep it under 20 words. Do not use quotes.";
            const result = await model.generateContent(scriptPrompt);
            const script = await result.response.text();
            
            return {
                statusCode: 200,
                body: JSON.stringify({ script }),
            };
        } else if (action === 'analyze_audio') {
            // Logic to analyze the audio
            if (!base64Audio || !prompt || !mimeType) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ error: "Missing required fields for audio analysis." }),
                };
            }

            const payload = {
                contents: [{
                    parts: [
                        { text: prompt },
                        {
                            inlineData: {
                                mimeType: mimeType,
                                data: base64Audio,
                            }
                        }
                    ]
                }]
            };

            const result = await model.generateContent(payload);
            const responseText = await result.response.text();
            
            try {
                const feedback = JSON.parse(responseText.trim().replace(/^`+|`+$/g, ''));
                return {
                    statusCode: 200,
                    body: JSON.stringify(feedback),
                };
            } catch (jsonError) {
                console.error("Failed to parse LLM response as JSON:", jsonError);
                return {
                    statusCode: 500,
                    body: JSON.stringify({ error: "Invalid response from the AI model." }),
                };
            }

        } else {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: "Invalid action specified." }),
            };
        }

    } catch (error) {
        console.error("Function error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "An unexpected error occurred." }),
        };
    }
};
