const admin = require("firebase-admin");

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(
            JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
        )
    });
}
const { GoogleGenerativeAI } = require('@google/generative-ai');
const GEMINI_API_KEY = process.env.SUM_GAME_KEY;

// Firestore/Google Cloud Data Keys (Preserved for future operations)
const FIRESTORE_KEY = process.env.DATA_API_KEY; 
const PROJECT_ID = process.env.FIRESTORE_PROJECT_ID; 
const SQUARESPACE_TOKEN = process.env.SQUARESPACE_ACCESS_TOKEN; 

const LLM_MODEL = 'gemini-2.0-flash-001'; 

const FIRESTORE_BASE_URL =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/`;

exports.handler = async (event) => {
    // FIX 2: CORS PREFLIGHT (Preserved)
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

    // FIREBASE CONFIG (GET) (Preserved)
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
const userId = decodedToken.uid; // ✅ TRUST ONLY THIS

// Parse body AFTER auth
const { userInput, action, isBossFight } = JSON.parse(event.body);


        // NEW CLEAR LOGIC (Preserved)
        if (action === 'CLEAR_ALL') {
            console.log("Action: Clearing all tasks for user", userId);
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

        // BOSS FIGHT INJECTION: We only add this if the frontend sends the flag
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
        
        console.log("Raw AI Response:", rawResponse);

        const MAX_TASK_VALUE = 5000;

const sanitizedTasks = parsedTasks.map(t => {
    if (t.type === 'strategy') return t;

    return {
        ...t,
        estimatedValue: Math.min(
            Number(t.estimatedValue) || 0,
            MAX_TASK_VALUE
        )
    };
});
        
        let parsedTasks;
        try {
            parsedTasks = JSON.parse(rawResponse);
        } catch (e) {
            const jsonMatch = rawResponse.match(/\[[\s\S]*\]/);
            if (!jsonMatch) {
                console.error("No JSON array found in response:", rawResponse);
                throw new Error("AI response did not contain a valid task list.");
            }
            parsedTasks = JSON.parse(jsonMatch[0]);
        }

        // DATA RETURN ONLY (Preserved logic)
        return {
            statusCode: 200,
            headers: { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type'
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
