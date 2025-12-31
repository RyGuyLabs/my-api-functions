const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require('@google/generative-ai');

const GEMINI_API_KEY = process.env.SUM_GAME_KEY;
const LLM_MODEL = 'gemini-2.0-flash-001'; 
const PROJECT_ID = process.env.FIRESTORE_PROJECT_ID;

// --- Secure Firebase Initialization ---
if (!admin.apps.length) {
    if (!process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
        throw new Error("Missing Firebase credentials in environment variables.");
    }

    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        }),
        databaseURL: `https://${PROJECT_ID}.firebaseio.com`
    });
}

const FIRESTORE_BASE_URL =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/`;

exports.handler = async (event) => {
    if (event.httpMethod.toUpperCase() === 'OPTIONS') {
        return {
            statusCode: 204,
            headers: { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            },
            body: ''
        };
    }

    if (event.httpMethod.toUpperCase() === 'GET') {
        const config = {
            apiKey: process.env.FIREBASE_API_KEY || null,
            projectId: PROJECT_ID || null,
            appId: process.env.FIREBASE_APP_ID || null
        };

        const statusCode = (config.apiKey && config.projectId) ? 200 : 500;
        return {
            statusCode,
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
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

        const authHeader = event.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return {
                statusCode: 401,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: "Unauthorized" })
            };
        }

        const idToken = authHeader.replace("Bearer ", "");
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const userId = decodedToken.uid;

        const { userInput, action, isBossFight } = JSON.parse(event.body);

        if (action === 'CLEAR_ALL') {
            return {
                statusCode: 200,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ message: "Task list cleared successfully" })
            };
        }

        if (!userInput) {
            return {
                statusCode: 400,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Missing userInput.' })
            };
        }

        let systemPrompt = `CRITICAL INSTRUCTION: You are a Strategic RPG Quest Designer.
1. Extract tasks into a JSON array of objects with: "taskName", "estimatedValue", and "type": "task".
2. Identify the most difficult or high-impact task.
3. Add ONE final object to the array: 
{"type": "strategy", "bossTask": "Name of hardest task", "advice": "Short RPG-style tactical advice"}.

STRICT: Return ONLY the JSON array.`;

        if (isBossFight) {
            systemPrompt += `
CRITICAL: THE AGENT IS IN A BOSS FIGHT. 
- Consolidate input into ONE major "Strategic Boss Task".
- Set "estimatedValue" between 3000 and 5000.
- Make the advice extremely high-stakes and intense.`;
        }

        const model = genAI.getGenerativeModel({ model: LLM_MODEL });
        const combinedPrompt = `${systemPrompt}\n\nUser Input: ${userInput}`;

        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: combinedPrompt }] }],
            generationConfig: { responseMimeType: "application/json" }
        });

        const response = await result.response;
        const rawResponse = response.text();

        let parsedTasks;
        try {
            parsedTasks = JSON.parse(rawResponse);
        } catch (e) {
            const jsonMatch = rawResponse.match(/\[[\s\S]*\]/);
            if (!jsonMatch) throw new Error("AI response did not contain a valid task list.");
            parsedTasks = JSON.parse(jsonMatch[0]);
        }

        const MAX_TASK_VALUE = 5000;

        const sanitizedTasks = parsedTasks.map(t => {
            if (t.type === 'strategy') return t;
            return {
                ...t,
                estimatedValue: Math.min(Number(t.estimatedValue) || 0, MAX_TASK_VALUE)
            };
        });

        return {
            statusCode: 200,
            headers: { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type'
            },
            body: JSON.stringify(sanitizedTasks)
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
