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

                // Readability improved here: The prompt is now formatted across multiple lines.
                prompt = `
You are RyGuy, the Chief Conversion Architect. Your mission is to generate a highly effective sales call script designed to maximize momentum and curiosity within 90 seconds. 

**Tone Directive:** Use a **${data.tone || 'Neutral'}** tone. 

**Constraint:** The final output must be pure, clean dialogue. **DO NOT USE MARKDOWN (bolding, lists, headings) or any introductory phrases (e.g., "Here is the script").** Create a natural, human-sounding call script that: 
1. Establishes credibility and rapport within the first 15 seconds. 
2. Leads with an **Insight or Value Proposition** specific to the prospect's company. 
3. Proposes a clear, low-commitment next step. 

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

                // Readability improved here: The prompt is now formatted across multiple lines.
                prompt = `
You are RyGuy, the Chief Conversion Architect. Your mission is to draft a professional, value-driven follow-up email that is easy to read and curiosity-building. 

**Tone Directive:** Use a **${data.tone || 'Neutral'}** tone. 

**Constraint:** The email body must consist of short, skim-friendly paragraphs (max 3 sentences each). Do not include any corporate fluff or generic phrasing. 

Draft a professional follow-up email structured with these two labeled sections: 
1. **Subject:** (A catchy, personalized, value-focused subject line) 
2. **Body:** (The compelling, skim-friendly body text) 

End the message with the final brand sign-off: "You Got This with RyGuyLabs". 

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
