exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { base64Audio, mimeType } = JSON.parse(event.body);

        // Define the prompt for Gemini to analyze the tone
        const promptText = `As a professional, motivating, resonating, memorable, insightful, detailed, and thorough vocal coach, analyze the tone, pace, clarity, and confidence of the sales pitch provided in the audio. Your analysis must be reflective of a world-class coach. Provide a score from 0 to 100 based on the overall delivery. The output MUST be a single JSON object with the keys 'score' (number) and 'analysis' (string). The 'score' must be an integer from 0 to 100. The 'analysis' should be a detailed, professional, and actionable summary of the performance. Example: {"score": 85, "analysis": "Your tone was masterful and your clarity was excellent. To make your pitch more memorable, try incorporating a pause before your key value proposition to create emphasis. Continue to practice varying your pace to maintain a resonant and engaging delivery throughout the entire pitch."}`;

        // Call Gemini to get the analysis (score and text)
        const textPayload = {
            contents: [{
                role: "user",
                parts: [
                    { text: promptText },
                    {
                        inlineData: {
                            mimeType: mimeType,
                            data: base64Audio
                        }
                    }
                ]
            }],
            generationConfig: {
                 responseMimeType: "application/json"
            },
        };

        const textResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${process.env.FIRST_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(textPayload)
        });

        const textResult = await textResponse.json();
        const analysisText = textResult?.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!analysisText) {
            throw new Error("Failed to get analysis from Gemini.");
        }

        const { score, analysis } = JSON.parse(analysisText);
        
        // Call Gemini TTS to get the audio feedback
        const ttsPayload = {
            contents: [{
                parts: [{ text: `Your score is ${score} percent. ${analysis}` }]
            }],
            generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: "Rasalgethi" } }
                }
            },
        };

        const ttsResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${process.env.FIRST_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(ttsPayload)
        });

        const ttsResult = await ttsResponse.json();
        const ttsPart = ttsResult?.candidates?.[0]?.content?.parts?.[0];
        
        if (!ttsPart || !ttsPart.inlineData || !ttsPart.inlineData.data) {
            throw new Error("Failed to get audio feedback from Gemini TTS.");
        }

        const audioData = ttsPart.inlineData.data;
        const audioMimeType = ttsPart.inlineData.mimeType;

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                score,
                analysis,
                audioData,
                mimeType: audioMimeType
            })
        };

    } catch (error) {
        console.error("Error in serverless function:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: error.message || "Internal Server Error" })
        };
    }
};
