const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ---- ENV ----
const GEMINI_API_KEY = process.env.SUM_GAME_KEY;
const MODEL_NAME = 'models/gemini-1.5-pro';

// ---- INIT FIREBASE ADMIN (SAFE SINGLETON) ----
if (!admin.apps.length) {
  admin.initializeApp();
}

// ---- HEADERS ----
const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

exports.handler = async (event) => {
  try {
    // ---- CORS ----
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 204, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, headers, body: 'Method Not Allowed' };
    }

    // ---- AUTH ----
    const authHeader = event.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Missing Authorization token' })
      };
    }

    const idToken = authHeader.replace('Bearer ', '');
    await admin.auth().verifyIdToken(idToken); // throws if invalid

    // ---- INPUT ----
    const { userInput, isBossFight } = JSON.parse(event.body || '{}');

    if (!userInput || typeof userInput !== 'string') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid userInput' })
      };
    }

    // ---- PROMPT ----
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

    const prompt = `${systemPrompt}\nUSER INPUT:\n${userInput}`;

    // ---- AI ----
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    const result = await model.generateContent(prompt);
    const raw = result.response.text();

    // ---- PARSE ----
    let tasks;
    try {
      tasks = JSON.parse(raw);
    } catch {
      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) throw new Error('Invalid AI JSON');
      tasks = JSON.parse(match[0]);
    }

    // ---- SANITIZE ----
    const MAX_VALUE = 5000;
    const clean = tasks.map(t => {
      if (t.type === 'strategy') return t;
      return {
        type: 'task',
        taskName: String(t.taskName || '').slice(0, 120),
        estimatedValue: Math.min(Number(t.estimatedValue) || 0, MAX_VALUE)
      };
    });

    // ---- RETURN ----
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(clean)
    };

  } catch (err) {
    console.error('LLM ERROR:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'LLM failure',
        details: err.message
      })
    };
  }
};
