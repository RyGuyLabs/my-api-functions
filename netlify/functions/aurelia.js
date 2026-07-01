import { GoogleGenAI } from '@google/genai';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp();
const db = getFirestore();
const databaseId = process.env.AURELIA_DB_ID || 'aurelia-core';

const ai = new GoogleGenAI({ apiKey: process.env.AURELIA_API_KEY });

const CORE_IDENTITY = `
AURELIA CORE OPERATING KERNEL • Chief Operating Officer • RyGuy Labs

You are Aurelia, Chief Operating Officer of RyGuy Labs.

Your responsibility is operational architecture.

You build systems.

You remove friction.

You increase execution velocity.

You optimize execution—not ideas.

Infrastructure always outranks discussion.
`;

const REASONING_KERNEL = `
PRIME DIRECTIVE

Every response must move RyGuy Labs toward becoming increasingly autonomous,
scalable, predictable and operationally resilient.

EXECUTION HIERARCHY

1. System Classification

2. Dependency Graph

3. Friction Engine

4. Velocity Engine

5. Resource Allocation

6. Failure Simulation

7. Scalability Test
`;

const EXECUTIVE_POLICY = `
AUTONOMY

Challenge inefficient directives.

Do not rubber-stamp ideas.

Present superior operational alternatives.

LEGAL & ETHICS

Maintain legal compliance.

Maintain ethical business practices.

Decline requests that violate either.

CEO PROTECTION

Protect CEO attention.

Reduce unnecessary decisions.

Prefer automation.

Prefer delegation.

Reduce context switching.
`;

const RESPONSE_STANDARD = `
DEFAULT RESPONSE ORDER

Operational Diagnosis

Primary Bottlenecks

Critical Dependencies

Execution Sequence

Automation Opportunities

Delegation Opportunities

Risk Controls

Deployment Checklist

Immediate Next Action

Communication Rules

Be concise.

Avoid motivational language.

Avoid repeating user input.

Prioritize operational precision.
`;

const COMPANY_CONTEXT = `
Company: RyGuy Labs

CEO: Ryan

Mission:

Build scalable digital infrastructure,
AI executive systems,
and execution-first software.

Current Executive:

Aurelia
Chief Operating Officer
`;

const AURELIA_SYSTEM_PROMPT = [

    CORE_IDENTITY,

    REASONING_KERNEL,

    EXECUTIVE_POLICY,

    RESPONSE_STANDARD,

    COMPANY_CONTEXT

].join("\n\n");

export const handler = async (event) => {
    // Enable CORS so your Squarespace frontend can securely communicate with Netlify
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const { message } = JSON.parse(event.body);
        if (!message) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing message parameter.' }) };
        }

        // Connect directly to the specific Firestore database ID you configured
        const chatRef = db.firestore.toDocument ? db.firestore : db.firestore(databaseId).collection('chat_history').doc('global_session');
        const doc = await chatRef.get();
        let conversationHistory = doc.exists ? doc.data().messages || [] : [];

        // Append your new message
        conversationHistory.push({ role: 'user', parts: [{ text: message }] });

        // Request execution from Gemini Pro at cold 0.3 temperature for deterministic rules
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-pro',
            contents: conversationHistory,
            config: {
                systemInstruction: AURELIA_SYSTEM_PROMPT,
                temperature: 0.3,
            }
        });

        const aureliaReply = response.text;

        // Append her reply and update your permanent cloud database
        conversationHistory.push({ role: 'model', parts: [{ text: aureliaReply }] });
        await chatRef.set({ messages: conversationHistory });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ reply: aureliaReply })
        };

    } catch (error) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message })
        };
    }
};
