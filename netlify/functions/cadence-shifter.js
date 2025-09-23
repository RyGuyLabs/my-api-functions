const { GoogleGenerativeAI } = require("@google/generative-ai");

exports.handler = async function(event, context) {
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: "Method Not Allowed" })
        };
    }

    const { prompt, text } = JSON.parse(event.body);

    if (!prompt || !text) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: "Missing 'prompt' or 'text' in request body." })
        };
    }

    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "API key is not set." })
        };
    }

    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-05-20" });

    try {
        const result = await model.generateContent([
            `Task: Transform the following text based on the user's prompt.
            Prompt: ${prompt}
            Original Text: ${text}
            
            Transformed Text:`,
        ]);
        const transformedText = result.response.text();
        
        // This is the key change: wrapping the text in an object
        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ transformedText: transformedText }),
        };

    } catch (error) {
        console.error("API call failed:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Failed to generate content from AI." }),
        };
    }
};
