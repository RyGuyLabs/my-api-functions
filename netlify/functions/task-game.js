const { db } = require('./firebaseClient'); 
const { GoogleGenerativeAI } = require('@google/generative-ai');

const GEMINI_API_KEY = process.env.SUM_GAME_KEY;
const LLM_MODEL = 'gemini-2.0-flash-001'; 
const PROJECT_ID = process.env.FIRESTORE_PROJECT_ID;

const defaultHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

exports.handler = async (event) => {
    try {
        if (event.httpMethod.toUpperCase() === 'OPTIONS') {
            return {
                statusCode: 204,
                headers: defaultHeaders,
                body: ''
            };
        }

        if (event.httpMethod.toUpperCase() === 'GET') {
            const config = {
                apiKey: process.env.FIREBASE_API_KEY || null,
                projectId: PROJECT_ID || null,
                appId: process.env.FIREBASE_APP_ID || null
            };
            return {
                statusCode: (config.apiKey && config.projectId) ? 200 : 500,
                headers: defaultHeaders,
                body: JSON.stringify(config)
            };
        }

        if (event.httpMethod !== 'POST') {
            return { statusCode: 405, headers: defaultHeaders, body: 'Method Not Allowed' };
        }

        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const authHeader =
  event.headers.authorization || event.headers.Authorization;

if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
        statusCode: 401,
        headers: defaultHeaders,
        body: JSON.stringify({ error: 'Missing or invalid Authorization header' })
    };
}

const idToken = authHeader.replace('Bearer ', '');

const verifyResponse = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${process.env.FIREBASE_API_KEY}`,
    {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken })
    }
);

const verifyData = await verifyResponse.json();

if (!verifyData.users || !verifyData.users[0]?.localId) {
    return {
        statusCode: 401,
        headers: defaultHeaders,
        body: JSON.stringify({ error: 'Invalid Firebase authentication token' })
    };
}

const userId = verifyData.users[0].localId;

        const { userInput, action, isBossFight } = JSON.parse(event.body);

        if (action === 'CLEAR_ALL') {
            return {
                statusCode: 200,
                headers: defaultHeaders,
                body: JSON.stringify({ message: "Task list cleared successfully" })
            };
        }

        if (!userInput) {
            return {
                statusCode: 400,
                headers: defaultHeaders,
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

        await db
  .collection('users')
  .doc(userId)
  .collection('tasks')
  .add({ tasks: sanitizedTasks });

        return {
            statusCode: 200,
            headers: defaultHeaders,
            body: JSON.stringify(sanitizedTasks)
        };

    } catch (error) {
        console.error('Task Game Function Error:', error);
        return {
            statusCode: 500,
            headers: defaultHeaders,
            body: JSON.stringify({ error: 'Failed to process request via LLM.', details: error.message })
        };
    }
};
