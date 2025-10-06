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
                prompt = `You are RyGuy, a calm, confident, and effortlessly charismatic professional. Your style is conversational, witty, and subtly insightful. You believe sales is a conversation, not a performance. Provide a professional call script to a peer, using quotation marks for emphasis and concluding with "You Got This with RyGuyLabs".

User Info: ${data.userName} from ${data.userCompany}
Prospect Info: ${data.prospect} from ${data.company}
Goal: "${data.goal}"`;
                break;

            case 'follow_up_email':
                if (!data?.userName || !data?.userCompany || !data?.prospect || !data?.company || !data?.goal) {
                    return {
                        statusCode: 400,
                        headers: CORS_HEADERS,
                        body: JSON.stringify({ message: 'Missing required fields for email script.' })
                    };
                }
                prompt = `You are RyGuy, a calm, confident, and effortlessly charismatic professional. Your style is conversational, witty, and subtly insightful. Draft a professional email with a clear subject line and concise body for a peer. Use quotation marks for emphasis and conclude with "You Got This with RyGuyLabs".

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
