const { GoogleGenerativeAI } = require('@google/generative-ai');

exports.handler = async (event) => {
    // This is the Netlify environment variable that holds your API key.
    const API_KEY = process.env.FIRST_API_KEY;

    if (!API_KEY) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "API key is not configured." })
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: "Method Not Allowed" })
        };
    }

    try {
        const body = JSON.parse(event.body);
        const { prompt } = body;

        // Create a new instance of the GoogleGenerativeAI client
        const genAI = new GoogleGenerativeAI(API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-05-20" });

        const payload = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        "category": { "type": "STRING", "description": "High, Medium, or Low" },
                        "score": { "type": "NUMBER", "description": "Score from 0 to 100" },
                        "report": { "type": "STRING", "description": "A detailed qualification report" },
                        "news": { "type": "STRING", "description": "A summary of recent company news" },
                        "outreachMessage": { "type": "STRING", "description": "A personalized outreach message draft" },
                        "predictiveInsight": { "type": "STRING", "description": "A short predictive insight" },
                        "discoveryQuestions": { "type": "STRING", "description": "A list of strategic discovery questions" }
                    },
                    "propertyOrdering": ["category", "score", "report", "news", "predictiveInsight", "outreachMessage", "discoveryQuestions"]
                }
            },
            tools: [{ "google_search": {} }]
        };

        const result = await model.generateContent(payload);
        const text = result.response.text();
        const jsonResponse = JSON.parse(text);

        return {
            statusCode: 200,
            body: JSON.stringify(jsonResponse)
        };

    } catch (error) {
        console.error("API call error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Failed to generate content." })
        };
    }
};
