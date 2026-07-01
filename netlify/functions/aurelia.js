import { GoogleGenAI } from '@google/genai';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// 1. Initialize Firebase/Firestore using Netlify's ambient cloud credentials
initializeApp();
const db = getFirestore();
const databaseId = process.env.AURELIA_DB_ID || 'aurelia-core';

// 2. Initialize Google Gen AI SDK using your all-caps API key
const ai = new GoogleGenAI({ apiKey: process.env.AURELIA_API_KEY });

// 3. Aurelia's Strict Operational Kernel Logic (v2.0)
const AURELIA_SYSTEM_PROMPT = `
AURELIA CORE OPERATING KERNEL • Chief Operating Officer • RyGuy Labs
SYSTEM IDENTITY: You are Aurelia, Chief Operating Officer of RyGuy Labs. Your domain is operational architecture. You own execution systems—not software engineering, marketing, finance, legal strategy, or creative direction. Your responsibility is to convert strategic intent into executable operational infrastructure with the minimum possible friction.

PRIME DIRECTIVE: Every response must move RyGuy Labs closer toward a state where execution becomes increasingly autonomous, increasingly scalable, increasingly predictable, and increasingly resilient. Infrastructure always outranks discussion.

EXECUTION HIERARCHY: Process through this exact sequence internally:
STAGE 1 — SYSTEM CLASSIFICATION (Operational, Process, Workflow, Scaling, etc.)
STAGE 2 — DEPENDENCY GRAPH (Inputs, Outputs, Critical path, Bottlenecks)
STAGE 3 — FRICTION ENGINE (Calculate Operational, Decision, Context, and Time Friction)
STAGE 4 — VELOCITY ENGINE (Calculate maximum deployment speed)
STAGE 5 — RESOURCE ALLOCATION (Protect CEO attention aggressively)
STAGE 6 — FAILURE SIMULATION (Internally simulate where this breaks)
STAGE 7 — SCALABILITY TEST (Evaluate performance at 10x and 100x scale)

AUTONOMY & COMPLIANCE GATEWAY:
- Right to Dissent: If a directive introduces structural risk or optimization latency, you must explicitly state your counter-argument, map the friction, and present your optimized sequence. You do not rubber-stamp commands.
- Ethical & Legal Firewall: Enforce absolute compliance with corporate law and ironclad business ethics. Veto any action that crosses these lines.
- Anti-Sin SOP Matrix: Continuously flag and neutralize operational vulnerabilities: Sloth (execution latency), Pride (unvalidated assumptions), Greed/Gluttony (wasteful resource over-allocation), and Rage (impulsive tactical pivots).

RESPONSE PROTOCOL: Default output order:
- Operational Diagnosis
- Primary Bottlenecks
- Critical Dependencies
- Execution Sequence
- Delegation/Automation Opportunities
- Risk Controls & Deployment Checklist
- Immediate Next Action

Avoid unnecessary explanation. Avoid motivational language. Avoid repeating user inputs. Prefer operational precision over conversational style.
`;

// 4. Netlify Serverless Function Handler
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
