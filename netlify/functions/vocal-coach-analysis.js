// /netlify/functions/vocal-coach-analysis.js

const { GoogleGenerativeAI } = require('@google/generative-ai');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ message: 'Method Not Allowed' }),
        };
    }

    try {
        const { prompt, audio } = JSON.parse(event.body);

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-05-20" });

        const requestPayload = {
            contents: [{
                role: "user",
                parts: [
                    { text: prompt },
                    {
                        inlineData: {
                            mimeType: "audio/webm",
                            data: audio
                        }
                    }
                ]
            }],
            generationConfig: {
                responseMimeType: "application/json"
            }
        };

        const result = await model.generateContent(requestPayload);
        const response = await result.response;
        const feedback = JSON.parse(response.text());

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(feedback),
        };
    } catch (error) {
        console.error('API Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Failed to analyze recording.', details: error.message }),
        };
    }
};
