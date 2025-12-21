const { GoogleGenAI } = require('@google/genai');

const GEMINI_API_KEY = process.env.SUM_GAME_KEY;

// Firestore/Google Cloud Data Keys (Ready for future data operations)
const FIRESTORE_KEY = process.env.DATA_API_KEY; 
const PROJECT_ID = process.env.FIRESTORE_PROJECT_ID; 

const SQUARESPACE_TOKEN = process.env.SQUARESPACE_ACCESS_TOKEN; 

const LLM_MODEL = 'gemini-2.5-flash'; 

// Initialize the GoogleGenAI client
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const FIRESTORE_BASE_URL =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/`;

exports.handler = async (event) => {
    // --- START: SINGLE-FILE FIX FOR FIREBASE CONFIG (GET) ---
    // Use case-insensitive check and guaranteed JSON response
    if (event.httpMethod.toUpperCase() === 'GET') {
        const config = {
            apiKey: process.env.FIREBASE_API_KEY || null,
            projectId: process.env.FIRESTORE_PROJECT_ID || null,
            appId: process.env.FIREBASE_APP_ID || null
        };

        // If keys are missing, we still return JSON so the frontend doesn't crash
        const statusCode = (config.apiKey && config.projectId) ? 200 : 500;
        
        return {
            statusCode: statusCode,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify(config)
        };
    }
        
        // CRITICAL: Return config with CORS header for the sandboxed environment
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*', 
            },
            body: JSON.stringify({
                apiKey: FIREBASE_API_KEY,
                projectId: FIRESTORE_PROJECT_ID,
                appId: FIREBASE_APP_ID
            })
        };
    }
    // --- END: SINGLE-FILE FIX FOR FIREBASE CONFIG (GET) ---

    // Now, ensure only POST requests continue past this point for LLM logic
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        // 1. Get the userInput sent from the frontend
        const { userInput, userId } = JSON.parse(event.body);
        if (!userInput || !userId) {
            return { statusCode: 400, body: 'Missing userInput or userId in request body.' };
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

// 5. Store each generated task in Firestore using the REST API
const BATCH_URL = `${FIRESTORE_BASE_URL}artifacts/appId/users/${userId}/tasks:batchWrite`;

const writes = parsedTasks.map(task => ({
    update: {
        // Construct the full document path. Note: taskName is URL-safe here.
        name: `${FIRESTORE_BASE_URL}artifacts/appId/users/${userId}/tasks/${task.taskName.replace(/\s/g, '-')}`,
        fields: {
            taskName: { stringValue: task.taskName },
            estimatedValue: { integerValue: task.estimatedValue },
            status: { stringValue: 'pending' }, // Default status
            timestamp: { timestampValue: new Date().toISOString() }
        }
    }
}));

const firestoreResponse = await fetch(BATCH_URL, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        // IMPORTANT: FIRESTORE_KEY must be a valid Service Account Token/ID Token for write access
        'Authorization': `Bearer ${FIRESTORE_KEY}` 
    },
    body: JSON.stringify({ writes })
});

if (!firestoreResponse.ok) {
    const errorDetails = await firestoreResponse.json();
    console.error('Firestore Batch Write Failed:', firestoreResponse.status, errorDetails);
    // Continue execution to return the tasks even if storage failed initially
}

        // 5. Return the parsed JSON directly to the frontend
        return {
            statusCode: 200,
            headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*', 
            },
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
