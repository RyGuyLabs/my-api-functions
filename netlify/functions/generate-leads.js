const { GoogleGenAI } = require('@google/genai');

const LEAD_QUALIFIER_API_KEY = process.env.LEAD_QUALIFIER_API_KEY || "";
const ai = new GoogleGenAI({ apiKey: LEAD_QUALIFIER_API_KEY });

const leadSchema = {
    type: "ARRAY",
    description: "A list of high-quality sales leads based on the user's criteria.",
    items: {
        type: "OBJECT",
        properties: {
            companyName: {
                type: "STRING",
                description: "The full, professional name of the company."
            },
            website: {
                type: "STRING",
                description: "The root URL of the company website. Should start with http:// or https://."
            },
            contactEmail: {
                type: "STRING",
                description: "A primary contact email address (e.g., info@, sales@). Use 'N/A' if unable to find a specific contact."
            },
            confidenceScore: {
                type: "STRING",
                description: "A subjective quality score for the lead based on search results (High, Medium, Low)."
            }
        },
        required: ["companyName", "website", "contactEmail", "confidenceScore"]
    }
};

function buildPrompt(industry, searchQuery, qualityLevel, maxLeads) {
    let systemInstruction = `You are an expert lead generation specialist. Your task is to perform an internet search based on the user's query and strictly return a JSON array of ${maxLeads} leads. You MUST ONLY return valid JSON that conforms exactly to the provided schema. Do not include any explanatory text, markdown notes, or code fences (e.g., \`\`\`).`;

    let userQuery = "";
   
    switch (qualityLevel) {
        case 'low':
            userQuery = `Find up to ${maxLeads} diverse companies in the '${industry}' sector matching the broad term '${searchQuery}'. Prioritize quantity and speed. Focus on extracting just the company name and website.`;
            break;
        case 'high':
            userQuery = `Find the highest quality, most specific, and relevant companies (up to ${maxLeads}) in the '${industry}' sector matching the niche term '${searchQuery}'. You must attempt to find a verifiable contact email and provide a high confidence score only for exceptionally relevant results.`;
            systemInstruction += " Be highly selective and apply strict filters. If a required field cannot be found, use 'N/A' but try hard to find it.";
            break;
        case 'medium':
        default:
            userQuery = `Find a balanced set of up to ${maxLeads} relevant companies in the '${industry}' sector matching the query '${searchQuery}'. Include website and attempt to find a primary contact email.`;
            break;
    }
   
    return { systemInstruction, userQuery };
}

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
        'Access-Control-Max-Age': '86400',
        'Content-Type': 'application/json',
    };

    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ message: 'CORS check successful' }),
        };
    }
   
    if (event.httpMethod !== 'POST' || !event.body) {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ message: 'Method Not Allowed or Missing Body' }),
        };
    }

    let data;
    try {
        data = JSON.parse(event.body);
    } catch (error) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ message: 'Invalid JSON payload' }),
        };
    }

    // FIX: Accept both camelCase and snake_case from client requests
    const industry = data.industry;
    const search_query = data.search_query || data.searchQuery;
    const quality_level = data.quality_level || data.qualityLevel || 'medium';
    const max_leads = data.max_leads || data.maxLeads || 5;

    if (!industry || !search_query) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ 
                message: 'Missing required parameters: industry and search_query (or searchQuery) are required.',
                receivedPayload: data
            }),
        };
    }
   
    if (!LEAD_QUALIFIER_API_KEY) {
         return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ message: 'Server configuration error: LEAD_QUALIFIER_API_KEY is missing.' }),
        };
    }

    const { systemInstruction, userQuery } = buildPrompt(industry, search_query, quality_level, max_leads);

    let response;
    const maxRetries = 3;
    let lastError = null;

    for (let i = 0; i < maxRetries; i++) {
        try {
            response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: userQuery,
                config: {
                    systemInstruction: systemInstruction,
                    tools: [{ googleSearch: {} }],
                    responseMimeType: "application/json",
                    responseSchema: leadSchema
                }
            });
            break;
        } catch (error) {
            lastError = error;
            if (i < maxRetries - 1) {
                const delay = Math.pow(2, i) * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    if (!response) {
        console.error('Final API Error after retries:', lastError);
        return {
            statusCode: 503,
            headers,
            body: JSON.stringify({ message: 'Failed to generate leads due to API or network error after multiple retries.', error: lastError?.message }),
        };
    }
   
    try {
        const jsonText = response.text;
       
        if (!jsonText) {
             return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ message: 'AI model returned an empty response.' }),
            };
        }
       
        const leadsData = JSON.parse(jsonText);
       
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                message: 'Leads generated successfully.',
                data: leadsData,
            }),
        };

    } catch (error) {
        console.error('Error processing AI response:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                message: 'Error processing AI response into final JSON.',
                raw_response: response.text,
                error: error.message
            }),
        };
    }
};
