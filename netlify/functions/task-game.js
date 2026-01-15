const admin = require('firebase-admin');
const { collection, addDoc } = require('firebase-admin/firestore');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const GEMINI_API_KEY = process.env.SUM_GAME_KEY;
const MODEL_NAME = 'models/gemini-1.5-pro';

if (!admin.apps.length) {
  admin.initializeApp();
}

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*', // Replace * with your Squarespace domain if needed
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 204, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, headers, body: 'Method Not Allowed' };
    }

    const memberId = event.headers['x-member-id'];
    if (!memberId) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Missing Squarespace member ID' })
      };
    }

    const { userInput, action, isBossFight } = JSON.parse(event.body || '{}');

    if (action === 'CLEAR_ALL') {
      const tasksCollection = collection(admin.firestore(), `users/${memberId}/tasks`);
      // Optional: implement deletion logic here if you want to allow clearing
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ message: "Task list cleared successfully" })
      };
    }

    if (!userInput || typeof userInput !== 'string') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid userInput' })
      };
    }

    let systemPrompt = `
You are a Strategic RPG Quest Designer.

RULES:
- Return ONLY a JSON array
- Each task object:
  { "type": "task", "taskName": string, "estimatedValue": number }
- Add ONE final object:
  { "type": "strategy", "bossTask": string, "advice": string }
`;

    if (isBossFight) {
      systemPrompt += `
BOSS FIGHT MODE:
- Collapse input into ONE high-impact task
- estimatedValue: 3000–5000
- Advice must be intense and tactical
`;
    }

    const combinedPrompt = `${systemPrompt}\n\nUser Input: ${userInput}`;

    // ---- AI GENERATION ----
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: combinedPrompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    });

    const rawResponse = result.response.text();

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

    const tasksCollection = collection(admin.firestore(), `users/${memberId}/tasks`);
    await addDoc(tasksCollection, { tasks: sanitizedTasks, createdAt: admin.firestore.FieldValue.serverTimestamp() });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(sanitizedTasks)
    };

  } catch (error) {
    console.error('LLM Function Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to process request via LLM.', details: error.message })
    };
  }
};
