/**
 * Ultimate Premium Lead Generator – PRODUCTION BACKEND (API Integration)
 *
 * This file replaces simulated search/enrichment with real API calls
 * to Google Custom Search and the Gemini API to ensure leads are verifiable.
 *
 * It retains the dual-batch search strategy (General Web + Social Focus)
 * and the improved lead detail structure.
 */

const nodeFetch = require('node-fetch'); 
const fetch = nodeFetch.default || nodeFetch; 

// --- CRITICAL: Environment Variables for Real API Keys ---
// These variables must be set in the deployment environment.
const GEMINI_API_KEY = process.env.LEAD_QUALIFIER_API_KEY || "";
const SEARCH_API_KEY = process.env.RYGUY_SEARCH_API_KEY || "";
const SEARCH_ENGINE_ID = process.env.RYGUY_SEARCH_ENGINE_ID || "";

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent';
const GOOGLE_SEARCH_URL = 'https://www.googleapis.com/customsearch/v1';

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

// --- CORE UTILITIES ---

/**
 * Implements exponential backoff for API retries.
 */
async function withBackoff(fn, maxRetries = 5) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === maxRetries - 1) {
                throw error;
            }
            const delay = Math.pow(2, i) * 1000 + Math.random() * 500;
            console.warn(`[API Retry] Attempt ${i + 1} failed. Retrying in ${Math.round(delay / 1000)}s...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

/**
 * CRITICAL: Aggressively cleans up the complex search term for Google Custom Search.
 * Keeps only the essential, high-intent keywords.
 */
function simplifyQueryForSearch(inputQuery) {
    if (!inputQuery) return '';
    
    // 1. Remove all parentheses and the content within them, and quotes
    let simplified = inputQuery.replace(/\(.*?\)|\"/g, ' ').trim();
    
    // 2. Remove explicit logic operators (AND, OR) and B2B targeting language
    simplified = simplified
        .replace(/(\sAND\s|\sOR\s)/gi, ' ')
        .replace(/for commercial leads targeting/i, '')
        .replace(/Key Person/i, '')
        .replace(/New Parent/i, '')
        .replace(/Small businesses/i, 'Small business');
    
    // 3. Clean up extra spaces and split into words
    simplified = simplified.replace(/\s{2,}/g, ' ').trim();
    
    // 4. Return the most relevant 7 words
    const finalKeywords = simplified.split(/\s+/).filter(word => word.length > 2);
    return finalKeywords.slice(0, 7).join(' ').trim();
}

/**
 * Fetches real search results using the Google Custom Search API.
 */
async function searchGoogle(query) {
    if (!SEARCH_API_KEY || !SEARCH_ENGINE_ID) {
         console.warn("[API Missing] SEARCH_API_KEY or SEARCH_ENGINE_ID not set. Returning zero results.");
         return [];
    }

    const searchUrl = `${GOOGLE_SEARCH_URL}?key=${SEARCH_API_KEY}&cx=${SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}`;
    
    console.log(`[Google Search] Sending Query: ${query}`);
    
    const response = await fetch(searchUrl);
    if (!response.ok) {
        throw new Error(`Google Search API failed with status ${response.status}`);
    }
    
    const data = await response.json();
    
    // Transform Custom Search API results into the expected snippet format
    return (data.items || []).map(item => ({
        title: item.title,
        snippet: item.snippet,
        url: item.link
    }));
}

/**
 * Calls the Gemini API to enrich a raw search snippet into a structured lead object.
 * This is the critical step that ensures the data is based on real grounding (the snippet).
 */
async function callGeminiForEnrichment(snippet, fullQuery, leadType, location, salesPersona) {
    if (!GEMINI_API_KEY) {
         console.warn("[API Missing] GEMINI_API_KEY not set. Cannot perform enrichment.");
         // Return a placeholder structure to allow the process to continue
         return {
            name: 'API Key Missing', website: snippet.url, email: null, phoneNumber: null,
            description: snippet.snippet, insights: 'Cannot enrich lead without Gemini API Key.',
            qualityScore: 'Low', suggestedAction: 'Check environment setup.', socialSignal: 'N/A',
            draftPitch: 'Please check API keys to generate verified leads.'
        };
    }

    const systemPrompt = `You are a world-class lead qualifier and sales development representative.
        Analyze the provided search snippet (Title, Snippet, URL) grounded by the Google Search API.
        Your task is to extract or infer a high-quality, actionable B2B or B2C lead object.
        The lead must be relevant to the sales persona: "${salesPersona}".
        
        CRITICAL RULES:
        1. Only use information EXPLICITLY contained within the snippet for grounding. Do NOT search externally.
        2. Infer the 'name' (Company Name or Individual Name) from the snippet's title or URL.
        3. Infer the 'website' (URL) from the snippet link.
        4. If a verifiable contact (email, phone, social handle) is not in the snippet, set it to NULL. **DO NOT** use placeholders like 'N/A' or 'Requires Research' for contact fields.
        5. The 'description' must be a one-sentence summary of the business/person's intent found in the snippet.
        6. The 'insights' must detail *why* this is a good lead for the sales persona.
        7. The 'socialSignal' must state if the lead shows active intent (e.g., asking for quotes, comparing competitors) based on the snippet text.
        8. The 'qualityScore' must be 'High', 'Medium', or 'Low' based on the clarity of intent in the snippet.
        9. The 'draftPitch' should be a concise, personalized opening line for the contact.
    `;
    
    const userQuery = `
        Search Snippet Title: ${snippet.title}
        Search Snippet Text: ${snippet.snippet}
        Search Snippet URL: ${snippet.url}
        Lead Type: ${leadType}
        Target Location: ${location}
        Full Search Query Context: ${fullQuery}
        
        Generate the lead object following the JSON schema exactly.
    `;

    const payload = {
        contents: [{ parts: [{ text: userQuery }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                properties: {
                    "name": { "type": "STRING", "description": "The Company Name or Individual's Name." },
                    "website": { "type": "STRING", "description": "The URL of the source or company website." },
                    "email": { "type": "STRING", "description": "Extracted email address, or null if not found." },
                    "phoneNumber": { "type": "STRING", "description": "Extracted phone number, or null if not found." },
                    "socialMediaHandle": { "type": "STRING", "description": "Extracted social media handle (e.g., @user) or null." },
                    "description": { "type": "STRING", "description": "A one-sentence summary of the entity or the intent." },
                    "insights": { "type": "STRING", "description": "Why this is a good lead (for the sales persona)." },
                    "qualityScore": { "type": "STRING", "enum": ["High", "Medium", "Low"], "description": "The inferred lead quality score." },
                    "suggestedAction": { "type": "STRING", "description": "The immediate next step (e.g., 'Check Reddit thread', 'Verify LLC details')." },
                    "socialSignal": { "type": "STRING", "description": "A signal of competitive shopping or active intent." },
                    "draftPitch": { "type": "STRING", "description": "A concise, personalized opening pitch." }
                },
                required: ["name", "website", "email", "phoneNumber", "socialMediaHandle", "description", "insights", "qualityScore", "suggestedAction", "socialSignal", "draftPitch"]
            }
        }
    };

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(`Gemini API failed with status ${response.status}`);
    }

    const result = await response.json();
    const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!jsonText) {
        throw new Error("Gemini response was empty or malformed.");
    }
    
    // Clean up potential markdown formatting that sometimes wraps the JSON
    const cleanedJsonText = jsonText.replace(/^```json\n?|\n?```$/g, '').trim();

    return JSON.parse(cleanedJsonText);
}


/**
 * Main lead generation logic using a dual-batch strategy with real APIs.
 */
async function generateLeadsBatch(leadType, searchTerm, activeSignal, location, salesPersona, financialTerm, socialFocus) {
    let leadData = [];

    // --- 1. APPLY AGGRESSIVE SIMPLIFICATION ---
    const simplifiedTerm = simplifyQueryForSearch(searchTerm);
    
    // --- BATCH 1: General Web & Location Focus ---
    // Finds business entities and general articles in the area.
    const generalQuery = `${simplifiedTerm} in "${location}" -job -careers -"blog post"`;
    const generalSnippets = await withBackoff(() => searchGoogle(generalQuery));
    
    // --- BATCH 2: Social Media Frequency Focus (HOT Leads) ---
    // Scoped to social platforms to find active discussions (frequency of use).
    const socialPlatforms = "site:linkedin.com OR site:reddit.com OR site:twitter.com";
    const socialQueryTerm = socialFocus || financialTerm || simplifiedTerm;
    const socialQuery = `${socialPlatforms} "${socialQueryTerm}" in "${location}"`;
    const socialSnippets = await withBackoff(() => searchGoogle(socialQuery));

    const allSnippets = [...generalSnippets, ...socialSnippets];

    if (allSnippets.length === 0) {
        console.warn(`[Batch Fail] No leads found after general and social searches.`);
        return [];
    }

    // --- ENRICHMENT: Run Gemini for every snippet concurrently ---
    const enrichmentPromises = allSnippets.map(snippet =>
        withBackoff(() => callGeminiForEnrichment(snippet, searchTerm, leadType, location, salesPersona))
            .then(lead => ({ ...lead, leadType })) // Add leadType back for frontend filtering
            .catch(error => {
                console.error(`Error enriching snippet: ${snippet.url}`, error);
                return null; // Ignore failed enrichments
            })
    );

    const enrichedLeads = (await Promise.all(enrichmentPromises)).filter(lead => lead !== null);

    // Filter out leads that lack a name or website, which indicates poor grounding
    leadData = enrichedLeads.filter(lead => lead.name && lead.website);
    
    // Deduplicate leads based on website/source URL
    const uniqueLeads = Array.from(new Map(leadData.map(lead => [lead.website, lead])).values());

    return uniqueLeads.slice(0, 3); // Max 3 for synchronous handler (adjust slice for background job)
}


// --- EXPORT HANDLERS ---

/**
 * Synchronous lead generation endpoint (exports.handler)
 */
exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: CORS_HEADERS, body: 'OK' };
    }

    try {
        const body = JSON.parse(event.body);
        
        const { leadType, searchTerm, location, salesPersona, activeSignal, financialTerm, socialFocus } = body;

        if (!searchTerm || !location) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
                body: JSON.stringify({ error: "Required fields 'searchTerm' and 'location' are missing or empty in the payload." })
            };
        }

        const leads = await generateLeadsBatch(
            leadType || 'commercial', 
            searchTerm, 
            activeSignal || '', 
            location, 
            salesPersona || 'General Sales Representative', 
            financialTerm || '',
            socialFocus || ''
        );

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
            body: JSON.stringify({ leads: leads, count: leads.length, message: `Successfully generated ${leads.length} high-fidelity leads from real-time search and AI enrichment.` })
        };

    } catch (err) {
        console.error('Lead Generator Handler Error:', err);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
            body: JSON.stringify({ error: err.message, details: "An internal error occurred during real-time lead generation." })
        };
    }
};

/**
 * Asynchronous background lead generation endpoint (exports.background)
 */
exports.background = async (event) => {
    // Note: Background job logic is simplified here to use the same batching as handler 
    // but can be extended to support more batches (e.g., 8-10) for deep searches.
    let body;
    try {
        body = JSON.parse(event.body);
    } catch (e) {
        body = event;
    }

    try {
        const { 
            leadType = 'commercial', 
            searchTerm, 
            location, 
            salesPersona = 'General Sales Representative', 
            activeSignal, 
            financialTerm,
            socialFocus 
        } = body;
        
        if (!searchTerm || !location) {
            const errorMessage = "Required fields 'searchTerm' and 'location' are missing or empty in the payload. Aborting background job.";
            console.error(errorMessage);
            return {
                statusCode: 200, 
                headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
                body: JSON.stringify({ error: errorMessage })
            };
        }

        console.log(`[Background] Starting JOB for: ${searchTerm} in ${location}.`);

        const leads = await generateLeadsBatch(
            leadType, 
            searchTerm, 
            activeSignal || '', 
            location, 
            salesPersona, 
            financialTerm || '',
            socialFocus || ''
        );
        
        console.log(`[Background] Job finished successfully. Generated ${leads.length} high-fidelity leads.`);
        
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
            body: JSON.stringify({ leads: leads, count: leads.length, message: `Successfully generated ${leads.length} leads in background using real APIs.` })
        };
    } catch (err) {
        console.error('Lead Generator Background Error:', err);
        return {	
            statusCode: 500,	
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
            body: JSON.stringify({ error: err.message, details: err.cause || 'An internal error occurred during the background job.' })
        };
    }
};
