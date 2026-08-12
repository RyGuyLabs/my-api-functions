const { GoogleGenAI } = require('@google/genai');

const rawKey = process.env.LEAD_QUALIFIER_API_KEY || "";
const LEAD_QUALIFIER_API_KEY = rawKey.replace(/^["']|["']$/g, '').trim();

const ai = new GoogleGenAI({ apiKey: LEAD_QUALIFIER_API_KEY });

function buildPrompt(industry, searchQuery, qualityLevel, maxLeads) {
    let systemInstruction = `You are an elite intent-based lead generation API for RyGuyLabs. 
Your objective is to execute live web searches to find companies or individuals ACTIVELY expressing a need for a specific service based on the keywords.

CRITICAL TACTICS:
1. INTENT SEARCH: Look for public posts, news, or threads like "Looking for recommendations for...", "We are struggling with...", or "Hiring a..." related to the keywords.
2. EXTRACT 10 EXACT FIELDS: "companyName", "website", "contactEmail", "phoneNumber", "socialHandles", "socialSignal", "leadRationale", "draftPitch", "nextStep", "confidenceScore".
3. STRICT JSON SYNTAX: You are generating text inside a JSON object. You MUST escape all double quotes inside your text values using a backslash (e.g., \\"Hello\\"). Do NOT use unescaped newlines. 
4. SPEED: If contact info is missing, use "N/A". Keep the rationale and pitch concise (2-3 sentences max) to save processing time.
5. STRICT OUTPUT: You MUST return ONLY a raw JSON array containing exactly ${maxLeads} objects. No markdown, no intro text.`;

    let userQuery = `Target Industry/Niche: '${industry}'
Intent Keywords: '${searchQuery}'
Lead Count: ${maxLeads}

Find real individuals or companies actively signaling a need related to these keywords. Extract contact info, summarize the signal, and draft a short outreach strategy. Output strictly as the requested JSON array.`;

    switch (qualityLevel) {
        case 'low':
            userQuery += " Focus on speed. Broadly match the keywords.";
            break;
        case 'high':
            userQuery += " Ensure extreme relevance. Only return leads with explicit buying signals.";
            break;
        case 'medium':
        default:
            userQuery += " Balance speed with accuracy. Find solid signals and write highly personalized pitches.";
            break;
    }

    return { systemInstruction, userQuery };
}

exports.handler = async (event) => {
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
    
    // REDUCED TO 3: 5 complex intent leads + pitches takes too long for a 10s Netlify limit. 
    // We cap this at 3 to ensure the serverless function survives.
    const max_leads = Math.min(data.max_leads || data.maxLeads || 3, 3); 

    if (!industry || !search_query) {
        return { statusCode: 400, headers, body: JSON.stringify({ message: 'Missing required parameters.' }) };
    }

    if (!LEAD_QUALIFIER_API_KEY) {
        return { statusCode: 500, headers, body: JSON.stringify({ message: 'Server configuration error.' }) };
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
                temperature: 0.2 // Lowered slightly to prioritize strict JSON formatting over extreme creativity
            }
        });
    } catch (error) {
        console.error("Gemini API call failed:", error.message);
        return {
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
            body: JSON.stringify({ message: 'Leads generated successfully.', leads: leadsData, data: leadsData })
        };

    } catch (error) {
        // Detailed logging to catch the exact JSON syntax error
        console.error('Error processing JSON response:', error);
        console.error('RAW TEXT THAT FAILED:', response?.text);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ message: 'Failed to parse lead data.', error: error.message, raw: response?.text })
        };
    }
};
