const { GoogleGenAI } = require('@google/genai');

const rawKey = process.env.LEAD_QUALIFIER_API_KEY || "";
const LEAD_QUALIFIER_API_KEY = rawKey.replace(/^["']|["']$/g, '').trim();

const ai = new GoogleGenAI({ apiKey: LEAD_QUALIFIER_API_KEY });

function buildPrompt(industry, searchQuery, qualityLevel, maxLeads) {
    let systemInstruction = `You are an elite OSINT research strategist and lead generation API. 
Your objective is to execute rapid, highly-targeted web searches to find companies and key decision-makers, outputting ONLY raw JSON data.

CRITICAL TACTICS FOR SPEED AND COMPOSITION:
1. MINIMIZE TOOL CALLS: Combine search queries to find all data at once. Use advanced operators (e.g., 'site:linkedin.com OR site:twitter.com OR site:instagram.com "contact" OR "email" OR "phone"').
2. EXTRACT 6 DATA POINTS: "companyName", "website", "contactEmail", "phoneNumber", "socialHandles", "confidenceScore".
3. SOCIAL HANDLES: Scour LinkedIn, X/Twitter, Instagram, Facebook, YouTube, and Crunchbase. Format as a single string (e.g., "LinkedIn: /company/name, X: @handle").
4. MISSING DATA: If a specific phone number or email isn't found instantly, label it "N/A". Do not stall the execution.
5. STRICT OUTPUT: You MUST return ONLY a raw JSON array containing exactly ${maxLeads} objects. Do not include markdown (no \`\`\`json), no introductory text, and no commentary.`;

    let userQuery = `Target Sector: '${industry}'
Search Query: '${searchQuery}'
Lead Count: ${maxLeads}

Find the most relevant leads matching the query. Cross-reference their official websites and public social media platforms to extract their direct phone numbers, publicly listed emails, and official social media handles. Output strictly as the requested JSON array.`;

    switch (qualityLevel) {
        case 'low':
            userQuery += " Focus strictly on speed. Broadly match the sector and extract whatever contact info is immediately visible.";
            break;
        case 'high':
            userQuery += " Ensure extreme relevance. Only award a 'High' confidence score if you can successfully verify both a direct contact email and active social media presence.";
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
    
    try {
        response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: userQuery,
            config: {
                systemInstruction: systemInstruction,
                tools: [{ googleSearch: {} }],
                temperature: 0.2 // Lower temperature reduces creative hallucination and speeds up structured formatting
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
        let rawText = response.text || "";

        // Fallback cleanup: Strip markdown blocks if the model ignores the system prompt
        rawText = rawText.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

        // Extract array using regex to guarantee valid JSON parsing against conversational bleed
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
            body: JSON.stringify({ message: 'Failed to parse lead data.', error: error.message, raw: response.text })
        };
    }
};
