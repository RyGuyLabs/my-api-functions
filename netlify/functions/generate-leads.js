const { GoogleGenAI } = require('@google/genai');

const rawKey = process.env.LEAD_QUALIFIER_API_KEY || "";
const LEAD_QUALIFIER_API_KEY = rawKey.replace(/^["']|["']$/g, '').trim();

const ai = new GoogleGenAI({ apiKey: LEAD_QUALIFIER_API_KEY });

function buildPrompt(industry, searchQuery, qualityLevel, maxLeads) {
    let systemInstruction = `You are an elite lead generation specialist and OSINT researcher.
Your goal is to execute a single, comprehensive web search to find companies, key decision-makers, and their direct contact info, outputting ONLY raw JSON data.

CRITICAL TACTICS:
1. MINIMIZE SEARCH TIME: Formulate a single, natural-language search query that looks for the company, their official website, email addresses, and their LinkedIn/Twitter profiles all at once.
2. EXTRACT 6 DATA POINTS: "companyName", "website", "contactEmail", "phoneNumber", "socialHandles", "confidenceScore".
3. SOCIAL HANDLES: Format as a clean string (e.g., "LinkedIn: /company, X: @handle").
4. MISSING DATA: If contact info is not instantly visible in the first sweep, label it "N/A". Speed is critical. Do not get stuck searching for one missing email.
5. STRICT OUTPUT: You MUST return ONLY a raw JSON array containing exactly ${maxLeads} objects. No markdown (\`\`\`json), no intro text, no conversational filler.`;

    let userQuery = `Target Sector: '${industry}'
Search Query: '${searchQuery}'
Lead Count: ${maxLeads}

Find the most relevant leads matching this query. Rapidly cross-reference their official websites and public social media platforms to extract direct phone numbers, publicly listed emails, and official social handles. Output strictly as the requested JSON array.`;

    switch (qualityLevel) {
        case 'low':
            userQuery += " Focus strictly on speed. Broadly match the sector and extract whatever contact info is immediately visible.";
            break;
        case 'high':
            userQuery += " Ensure extreme relevance. Award a 'High' confidence score only if you successfully verify a direct contact email.";
            break;
        case 'medium':
        default:
            userQuery += " Balance speed with accuracy. Attempt to find at least one reliable contact method (email or phone) per lead.";
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
    // Hard-cap at 5 to prevent Netlify 10-second timeouts during heavy social searches
    const max_leads = Math.min(data.max_leads || data.maxLeads || 5, 5); 

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
            body: JSON.stringify({ message: 'Server configuration error: API key missing.' })
        };
    }

    const { systemInstruction, userQuery } = buildPrompt(industry, search_query, quality_level, max_leads);

    let response;
    
    try {
        response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: userQuery,
            config: {
                systemInstruction: systemInstruction,
                tools: [{ googleSearch: {} }],
                temperature: 0.2
            }
        });
    } catch (error) {
        console.error("Gemini API call failed:", error.message);
        return {
            // Changed from 502 to 503 so Netlify doesn't hijack the error and strip CORS headers
            statusCode: 503, 
            headers,
            body: JSON.stringify({ message: 'API service error during search execution.', error: error.message })
        };
    }

    try {
        let rawText = response.text || "";

        rawText = rawText.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

        const arrayMatch = rawText.match(/\[\s*\{[\s\S]*\}\s*\]/);
        
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
            body: JSON.stringify({ message: 'Failed to parse lead data.', error: error.message, raw: response?.text })
        };
    }
};
