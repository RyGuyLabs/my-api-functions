// the-scripter.js
const { GoogleGenerativeAI } = require('@google/generative-ai');

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
};

exports.handler = async function(event) {
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: CORS_HEADERS,
            body: ''
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: "Method Not Allowed" })
        };
    }

    try {
        const body = JSON.parse(event.body);
        const { feature, data } = body;

        const apiKey = process.env.FIRST_API_KEY;
        if (!apiKey || apiKey.trim() === '') {
            return {
                statusCode: 500,
                headers: CORS_HEADERS,
                body: JSON.stringify({ message: 'API Key is not configured.' })
            };
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const textModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        let prompt = '';

        switch(feature) {
    case 'call_script':
        if (!data?.userName || !data?.userCompany || !data?.prospect || !data?.company || !data?.goal) {
            return {
                statusCode: 400,
                headers: CORS_HEADERS,
                body: JSON.stringify({ message: 'Missing required fields for call script.' })
            };
        }

        const callTone = data?.tone ? `Use a **${data.tone} tone**.` : 'Use a neutral tone.';

        prompt = `You are RyGuy, a confident, energetic, and effortlessly charismatic sales professional.
Your communication style is:
- Persuasive without pressure
- Conversational and natural
- Clever and witty when appropriate
- Insightful and value-focused

You speak with clarity, momentum, and purpose while making the prospect feel respected and curious to continue the conversation.

Avoid filler, clichés, or robotic phrasing. Do not sound pushy or hype-driven.

${callTone}

Create a natural, human-sounding call script that:
- Builds rapport quickly
- Leads the conversation with value
- Highlights benefits without overselling

User Info: ${data.userName} from ${data.userCompany}
Prospect Info: ${data.prospect} from ${data.company}
Goal: "${data.goal}"

Use concise and real dialogue.`;

        break;

    case 'follow_up_email':
        if (!data?.userName || !data?.userCompany || !data?.prospect || !data?.company || !data?.goal) {
            return {
                statusCode: 400,
                headers: CORS_HEADERS,
                body: JSON.stringify({ message: 'Missing required fields for email script.' })
            };
        }

        const emailTone = data?.tone ? `Use a **${data.tone} tone**.` : 'Use a neutral tone.';

        prompt = `You are RyGuy, a confident, insightful, and effortlessly charismatic sales professional.
Your communication style is:
- Conversational and authentic
- Warm, clever, and lightly witty (only when appropriate)
- Value-driven and easy to skim

You write like a human—clear, concise, and curiosity-building. Avoid unnecessary details, clichés, and generic phrasing.

${emailTone}

Draft a professional follow-up email that includes:
- A clear, value-focused subject line
- A compelling, skim-friendly body
- Human tone without corporate fluff
- A friendly close that builds momentum

End the message with: "You Got This with RyGuyLabs".

User Info: ${data.userName} from ${data.userCompany}
Prospect Info: ${data.prospect} from ${data.company}
Goal: "${data.goal}"`;

        break;

    default:
        return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: `Invalid feature: ${feature}` })
        };
}

        const response = await textModel.generateContent({ contents: [{ parts: [{ text: prompt }] }] });
        const responseText = response.response?.text() || "No content returned.";

        return {
            statusCode: 200,
            headers: CORS_HEADERS,
            body: JSON.stringify({ text: responseText })
        };

    } catch (error) {
        console.error('Error in the-scripter function:', error);
        return {
            statusCode: 500,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: `Internal server error: ${error.message}` })
        };
    }
};
