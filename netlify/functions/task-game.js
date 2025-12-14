const { GoogleGenAI } = require('@google/genai');

// Use the hidden Environment Variable for the API key
// NOTE: Must match the key set in Netlify dashboard!
const GEMINI_API_KEY = process.env.SUM_GAME_KEY;

// Define the model you want to use
const LLM_MODEL = 'gemini-2.5-flash'; 

// Initialize the GoogleGenAI client
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        // 1. Get the userInput sent from the frontend
        const { userInput } = JSON.parse(event.body);

        if (!userInput) {
            return { statusCode: 400, body: 'Missing userInput in request body.' };
        }

        // 2. Define the secure prompt and JSON schema
        const systemPrompt = `You are a specialized AI designed to gamify tasks. The user provides a list of tasks in natural language. Your job is to break these down into concrete, single tasks, and assign an 'estimatedValue' in USD that represents the perceived value or cost of outsourcing/completing that task (e.g., 'Mow the lawn' might be $50). The output MUST be a JSON array conforming to the provided schema. Only output the JSON object.`;
        
        // 3. Make the secure call to the Gemini API
        const response = await ai.models.generateContent({
            model: LLM_MODEL,
            contents: [{ parts: [{ text: userInput }] }],
            config: {
                systemInstruction: { parts: [{ text: systemPrompt }] },
                responseMimeType: "application/json",
                responseSchema: {
                    type: "ARRAY",
                    items: {
                        type: "OBJECT",
                        properties: {
                            "taskName": { "type": "STRING", "description": "A concise description of the task." },
                            "estimatedValue": { "type": "NUMBER", "description": "The estimated USD value of the task, as an integer." }
                        },
                        required: ["taskName", "estimatedValue"]
                    }
                }
            }
        });

        // 4. Extract the JSON text and parse it
        const jsonText = response.text;
        const parsedTasks = JSON.parse(jsonText);

        // 5. Return the parsed JSON directly to the frontend
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(parsedTasks)
        };

    } catch (error) {
        console.error('LLM Function Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to process request via LLM.', details: error.message })
        };
    }
};
