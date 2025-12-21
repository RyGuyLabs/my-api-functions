const { GoogleGenAI } = require('@google/genai');

const GEMINI_API_KEY = process.env.SUM_GAME_KEY;

// Firestore/Google Cloud Data Keys (Ready for future data operations)
const FIRESTORE_KEY = process.env.DATA_API_KEY; 
const PROJECT_ID = process.env.FIRESTORE_PROJECT_ID; 

const SQUARESPACE_TOKEN = process.env.SQUARESPACE_ACCESS_TOKEN; 

// FIX 1: Use a valid model name (2.5 is not released/stable in this SDK yet)
const LLM_MODEL = 'gemini-2.0-flash-001'; 

const FIRESTORE_BASE_URL =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/`;

exports.handler = async (event) => {
    // FIX 2: Added CORS PREFLIGHT. Without this, ryguylabs.com cannot talk to Netlify.
    if (event.httpMethod.toUpperCase() === 'OPTIONS') {
        return {
            statusCode: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
            },
            body: ''
        };
    }

    // --- START: SINGLE-FILE FIX FOR FIREBASE CONFIG (GET) ---
    if (event.httpMethod.toUpperCase() === 'GET') {
        const config = {
            apiKey: process.env.FIREBASE_API_KEY || null,
            projectId: process.env.FIRESTORE_PROJECT_ID || null,
            appId: process.env.FIREBASE_APP_ID || null
        };

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
        
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        // Initialize the client inside the handler for better error catching
        const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

        const { userInput, userId } = JSON.parse(event.body);
        if (!userInput || !userId) {
            return { statusCode: 400, body: 'Missing userInput or userId in request body.' };
        }

        const systemPrompt = `You are a specialized AI designed to gamify tasks. The user provides a list of tasks in natural language. Your job is to break these down into concrete, single tasks, and assign an 'estimatedValue' in USD that represents the perceived value or cost of outsourcing/completing that task. The output MUST be a JSON array. Only output the JSON object.`;
        
        // FIX 3: Correct syntax for the @google/genai library
        const result = await ai.models.generateContent(LLM_MODEL, {
            contents: [{ parts: [{ text: userInput }] }],
            config: {
                systemInstruction: { parts: [{ text: systemPrompt }] },
                responseMimeType: "application/json"
            }
        });

        // The @google/genai SDK provides the text as a direct property
        const rawResponse = result.text; 
        const jsonText = rawResponse.replace(/```json|```/g, "").trim();
        
        const parsedTasks = JSON.parse(jsonText);
        console.log("Successfully parsed tasks:", parsedTasks.length);

        // --- RESTORED: FIRESTORE STORAGE LOGIC ---
        const BATCH_URL = `${FIRESTORE_BASE_URL}artifacts/appId/users/${userId}/tasks:batchWrite`;

        const writes = parsedTasks.map(task => ({
            update: {
                name: `${FIRESTORE_BASE_URL}artifacts/appId/users/${userId}/tasks/${task.taskName.replace(/\s/g, '-')}`,
                fields: {
                    taskName: { stringValue: task.taskName },
                    estimatedValue: { integerValue: Math.floor(task.estimatedValue) },
                    status: { stringValue: 'pending' },
                    timestamp: { timestampValue: new Date().toISOString() }
                }
            }
        }));

        const firestoreResponse = await fetch(BATCH_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${FIRESTORE_KEY}` 
            },
            body: JSON.stringify({ writes })
        });

        if (!firestoreResponse.ok) {
            const errorDetails = await firestoreResponse.json();
            console.error('Firestore Batch Write Failed:', firestoreResponse.status, errorDetails);
        }

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
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'Failed to process request via LLM.', details: error.message })
        };
    }
};
