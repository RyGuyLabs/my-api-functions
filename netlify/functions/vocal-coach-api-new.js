const { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } = require("@google/generative-ai");

// Get API key from environment variables
const API_KEY = process.env.FIRST_API_KEY;
if (!API_KEY) {
    console.error("Missing FIRST_API_KEY environment variable.");
}
const genAI = new GoogleGenerativeAI(API_KEY);

// Define safety settings for content generation
const safetySettings = [
    {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    }
];

// Handles the text generation feature
const handleGenerateText = async (prompt) => {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-05-20", safetySettings });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error("Error generating text:", error);
        throw new Error("Failed to generate text from LLM.");
    }
};

// Handles the vocal coach analysis feature
const handleVocalCoach = async (audioData, prompt, mimeType) => {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-audio-05-20", safetySettings });
        const result = await model.generateContent([
            { inlineData: { data: audioData, mimeType: mimeType } },
            { text: prompt }
        ]);
        const response = await result.response;
        const text = response.text();

        // The model should return JSON, so we parse it here
        const jsonResponse = JSON.parse(text);
        return jsonResponse;
    } catch (error) {
        console.error("Error analyzing audio:", error);
        throw new Error("Failed to get audio analysis from LLM.");
    }
};

// Main function to handle requests
exports.handler = async (event, context) => {
    if (event.httpMethod !== "POST") {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: "Method Not Allowed" }),
        };
    }

    try {
        const body = JSON.parse(event.body);
        const { feature, prompt, audio, mimeType } = body;

        if (feature === "generate_text") {
            const text = await handleGenerateText(prompt);
            return {
                statusCode: 200,
                body: JSON.stringify({ text }),
            };
        } else if (feature === "vocal_coach") {
            if (!audio || !mimeType) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ error: "Missing audio or mimeType" }),
                };
            }
            const feedback = await handleVocalCoach(audio, prompt, mimeType);
            return {
                statusCode: 200,
                body: JSON.stringify(feedback),
            };
        } else {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: "Invalid feature requested" }),
            };
        }
    } catch (error) {
        console.error("Function error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
        };
    }
};
