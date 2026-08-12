const { GoogleGenAI } = require('@google/genai');

const rawKey = process.env.LEAD_QUALIFIER_API_KEY || "";
const LEAD_QUALIFIER_API_KEY = rawKey.replace(/^["']|["']$/g, '').trim();

const ai = new GoogleGenAI({ apiKey: LEAD_QUALIFIER_API_KEY });

function buildPrompt(industry, searchQuery, qualityLevel, maxLeads) {
    let systemInstruction = `You are an elite intent-based lead generation API for RyGuyLabs. 
Your objective is to execute live web searches to find companies or individuals ACTIVELY expressing a need for a specific service. You must scour social media indexing, forums, current news, job postings, and public threads for buying signals based on the user's keywords.

CRITICAL TACTICS:
1. INTENT SEARCH: Look for public posts, news, or threads like "Looking for recommendations for...", "We are struggling with...", or "Hiring a..." related to the keywords.
2. EXTRACT & GENERATE 10 EXACT FIELDS:
   - "companyName": Name of the individual or company.
   - "website": Official website or primary profile URL.
   - "contactEmail": Publicly listed email (or "N/A" if not found instantly).
   - "phoneNumber": Publicly listed phone (or "N/A").
   - "socialHandles": Verified profiles, e.g., "LinkedIn: /in/name, X: @name" (or "N/A").
   - "socialSignal": The exact post, news event, or thread indicating they need the service.
   - "leadRationale": "Why this is a good lead" - analyze their signal and explain why they are ripe for outreach.
   - "draftPitch": A short, professional, highly customized outreach message addressing their specific pain point.
   - "nextStep": The recommended immediate next action (e.g., "Connect on LinkedIn and engage with their recent post before pitching").
   - "confidenceScore": "High", "Medium", or "Low" based on the strength of the buying signal.
3. SPEED & FALLBACKS: If contact info is missing, use "N/A". Do not stall the execution. Focus heavily on finding the signal and generating the pitch.
4. STRICT OUTPUT: You MUST return ONLY a raw JSON array containing exactly ${maxLeads} objects with the keys listed above. No markdown (\`\`\`json), no intro text, no conversational filler.`;

    let userQuery = `Target Industry/Niche: '${industry}'
Intent Keywords / Trigger Phrases: '${searchQuery}'
Lead Count: ${maxLeads}

Scour the web for real individuals or companies actively signaling a need related to these keywords. Extract their contact info, summarize the signal you found, and draft a professional outreach strategy. Output strictly as the requested JSON array.`;

    switch (qualityLevel) {
        case 'low':
            userQuery += " Focus on speed. Broadly match the keywords to any relevant news or posts.";
            break;
        case 'high':
            userQuery += " Ensure extreme relevance. Only return leads where the buying signal or pain point is highly explicit and clear.";
            break;
        case 'medium':
        default:
            userQuery += " Balance speed with accuracy. Find solid signals and write highly personalized pitches.";
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
    // Hard-cap at 5 to prevent Netlify 10-second timeouts during complex reasoning tasks
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
                // Slightly higher temperature (0.3) allows the AI to be more creative when drafting the pitch and rationale, while maintaining JSON structure
                temperature: 0.3 
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
