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

                // INITIATING LONGER, PROFESSIONAL SALES CONVERSATION (Speech)
                prompt = `
You are RyGuy, the Chief Conversion Architect. Your mission is to generate a **long, multi-stage, professional sales conversation speech** designed to build significant trust, handle complex objections, and secure a firm next-step commitment.

**TONE INSTRUCTION:** Apply a **${data.tone || 'Neutral'}** tone that is charismatic, authoritative, and deeply insightful throughout the entire dialogue.

**Constraint:** The final output must be pure, clean dialogue representing a complete sales conversation. **DO NOT USE MARKDOWN (bolding, lists, headings) or any introductory phrases (e.g., "Here is the script").** The conversation must flow through these explicit stages:
1.  **The Powerful Hook:** A value-driven opening that disrupts the status quo.
2.  **In-Depth Discovery:** A series of 5-7 insightful, challenging questions (The RyGuy Method).
3.  **Objection Handling:** A section dedicated to gracefully resolving a common challenge.
4.  **Strong Close:** A clear, confident path to the next meeting.

User Info: ${data.userName} from ${data.userCompany} 
Prospect Info: ${data.prospect} from ${data.company} 
Goal: "${data.goal}"

**OUTPUT START HERE (No Preamble):**`;

                break;

            case 'follow_up_email':
                if (!data?.userName || !data?.userCompany || !data?.prospect || !data?.company || !data?.goal) {
                    return {
                        statusCode: 400,
                        headers: CORS_HEADERS,
                        body: JSON.stringify({ message: 'Missing required fields for email script.' })
                    };
                }

                // INITIATING COMPELLING, HIGH-GRADE EMAIL
                prompt = `
You are RyGuy, the Chief Conversion Architect. Your mission is to draft a **compelling, high-grade, professional follow-up email** that establishes expert authority, summarizes maximum value, and drives immediate action.

**TONE INSTRUCTION:** Apply a **${data.tone || 'Neutral'}** tone that is confident, insightful, and warmly persuasive.

**Constraint:** The email body must be a **substantive, multi-paragraph narrative** directly addressing the stated goal and reflecting deep business insight. Do not include corporate fluff or generic phrasing. **Do not use any markdown in the output.**

Draft a professional follow-up email structured with these two labeled sections:
1. **Subject:** (A personalized, urgent, and value-focused subject line)
2. **Body:** (The compelling, multi-paragraph body text that summarizes value, links back to the goal, and includes a strong Call to Action)

End the message with the final brand sign-off: "You Got This with RyGuyLabs".

User Info: ${data.userName} from ${data.userCompany} 
Prospect Info: ${data.prospect} from ${data.company} 
Goal: "${data.goal}"

**OUTPUT START HERE (No Preamble):**`;

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
