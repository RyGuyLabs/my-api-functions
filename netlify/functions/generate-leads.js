const { GoogleGenAI } = require('@google/genai');

const rawKey = process.env.LEAD_QUALIFIER_API_KEY || "";
const LEAD_QUALIFIER_API_KEY = rawKey.replace(/^["']|["']$/g, '').trim();

const ai = new GoogleGenAI({ apiKey: LEAD_QUALIFIER_API_KEY });

function buildPrompt(industry, searchQuery, qualityLevel, maxLeads) {
    let systemInstruction = `You are an expert lead generation specialist. Perform an internet search and return EXACTLY a JSON array containing ${maxLeads} objects with fields: "companyName", "website", "contactEmail", "confidenceScore". Do not include extra text or markdown formatting.`;

    let userQuery = "";
   
    switch (qualityLevel) {
        case 'low':
            userQuery = `Find up to ${maxLeads} diverse companies in '${industry}' matching '${searchQuery}'. Focus on extracting company name and website.`;
            break;
        case 'high':
            userQuery = `Find the highest quality companies (up to ${maxLeads}) in '${industry}' matching '${searchQuery}'. Search for verifiable contact emails.`;
            break;
        case 'medium':
        default:
            userQuery = `Find up to ${maxLeads} relevant companies in '${industry}' matching '${searchQuery}'. Include website and primary contact email.`;
            break;
    }
   
    return { systemInstruction, userQuery };
}

exports.handler = async (event) => {
    // Guaranteed CORS Headers attached to ALL responses
    const headers = {
        'Access-Control-Allow-Origin': 'https://www.ryguylabs.com',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
        'Access-Control-Max-Age': '86400',
        'Content-Type': 'application/json',
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: JSON.stringify({ message: 'CORS preflight successful' }) };
    }
   
    if (event.httpMethod !== 'POST' || !event.body) {
        return { statusCode: 405, headers, body: JSON.stringify({ message: 'Method Not Allowed' }) };
    }

    let data;
    try {
        data = JSON.parse(event.body);
    } catch (error) {
        return { statusCode: 400, headers, body: JSON.stringify({ message: 'Invalid JSON payload' }) };
    }

    const industry = data.industry;
    const search_query = data.search_query || data.searchQuery;
    const quality_level = data.quality_level || data.qualityLevel || 'medium';
    const max_leads = data.max_leads || data.maxLeads || 5;

    if (!industry || !search_query) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ message: 'Missing required parameters: industry and search_query.' })
        };
    }
   
    if (!LEAD_QUALIFIER_API_KEY) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ message: 'Server configuration error: LEAD_QUALIFIER_API_KEY is missing.' })
        };
    }

    const { systemInstruction, userQuery } = buildPrompt(industry, search_query, quality_level, max_leads);

    let response;
    // Single execution (no long delays) to prevent hitting Netlify 10s timeout
    try {
        response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: userQuery,
            config: {
                systemInstruction: systemInstruction,
                tools: [{ googleSearch: {} }]
            }
        });
    } catch (error) {
        console.error("Gemini API call failed:", error.message);
        return {
            statusCode: 502,
            headers,
            body: JSON.stringify({ message: 'API service error during search execution.', error: error.message })
        };
    }

    try {
        const rawText = response.text || "";
       
        // Extract array using regex to guarantee valid JSON parsing
        const arrayMatch = rawText.match(/\[[\s\S]*\]/);
        
        if (!arrayMatch) {
            console.error("Failed to extract JSON array. Raw response:", rawText);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ message: 'AI returned non-JSON format.', raw: rawText })
            };
        }

        const leadsData = JSON.parse(arrayMatch[0]);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                message: 'Leads generated successfully.',
                leads: leadsData,
                data: leadsData
            })
        };

    } catch (error) {
        console.error('Error processing JSON response:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ message: 'Failed to parse lead data.', error: error.message })
        };
    }
};
