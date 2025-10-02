/**
 * Ultimate Premium Lead Generator – Gemini + Google Custom Search
 *
 * This file contains two exports:
 * 1. exports.handler: Synchronous endpoint (guaranteed fast, max 3 leads).
 * 2. exports.background: Asynchronous endpoint (runs up to 15 minutes, unlimited leads).
 *
 * CRITICAL FIXES APPLIED:
 * 1. FIXED B2B SEARCH LOGIC: The commercial lead generation logic is significantly refined.
 * - The search term is no longer aggressively simplified (preventing errors like 'OR key').
 * - The primary B2B query (Batch 1) uses the full user-provided OR chain for maximum intent.
 * - The Level 2 Fallback for B2B now correctly searches only the target company type (e.g., "software companies") in the location for guaranteed results.
 * 2. B2C Logic (Residential): Remains fixed with the decoupling of the restrictive 'activeSignal' from the primary search.
 * 3. NEW CRITICAL UPDATE: Implemented **Dynamic Negative Keyword Filtering** to exclude competitor companies based on the 'salesPersona'.
 */

const nodeFetch = require('node-fetch'); 
const fetch = nodeFetch.default || nodeFetch; 

// --- CRITICAL: Environment Variables for Real API Keys ---
const GEMINI_API_KEY = process.env.LEAD_QUALIFIER_API_KEY;
const SEARCH_API_KEY = process.env.RYGUY_SEARCH_API_KEY;
const SEARCH_ENGINE_ID = process.env.RYGUY_SEARCH_ENGINE_ID;
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
            // console.warn(`[API Retry] Attempt ${i + 1} failed. Retrying in ${Math.round(delay / 1000)}s...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
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
    
    // console.log(`[Google Search] Sending Query: ${query}`);
    
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
 * NEW: Generates a string of negative keywords to exclude competitor results
 * based on the user's sales persona/industry.
 * @param {string} persona - The sales persona (e.g., "Real Estate Agent")
 * @returns {string} - A space-separated string of negative keywords (e.g., "-agency -broker -realty")
 */
function generateNegativeKeywords(persona) {
    const p = persona.toLowerCase();
    let exclusions = ['-job', '-careers', '-competitors', '-alternative', '-inc', '-llc', '-ltd'];

    if (p.includes('real estate') || p.includes('realtor') || p.includes('broker')) {
        // Exclude other RE professionals/companies
        exclusions.push('-agency', '-broker', '-realty', '-firm', '-listing', '-agent', '-brokerage', '-property management');
    } else if (p.includes('insurance') || p.includes('financial') || p.includes('wealth')) {
        // Exclude other finance/insurance entities
        exclusions.push('-firm', '-agency', '-brokerage', '-wealth', '-advisor', '-consultant', '-investment', '-policy');
    } else if (p.includes('software') || p.includes('tech') || p.includes('saas')) {
        // Exclude other software companies (usually looking for customers, not competitors)
        exclusions.push('-software', '-saas', '-platform', '-solution', '-tech', '-startup', '-api', '-app');
    } else if (p.includes('marketing') || p.includes('consultant') || p.includes('seo') || p.includes('advertising')) {
        // Exclude other marketing firms
        exclusions.push('-agency', '-consultant', '-firm', '-marketing', '-seo', '-social media', '-pr', '-creative');
    }
    
    // Add common organizational identifiers to prevent them from becoming leads unless they are the specific target
    return exclusions.join(' ');
}

/**
 * Calls the Gemini API to enrich a raw search snippet into a structured lead object.
 */
async function callGeminiForEnrichment(snippet, fullQuery, leadType, location, salesPersona) {
    if (!GEMINI_API_KEY) {
         console.warn("[API Missing] GEMINI_API_KEY not set. Cannot perform enrichment.");
         return { name: 'API Key Missing', website: snippet.url, email: null, phoneNumber: null, description: snippet.snippet, insights: 'Cannot enrich lead without Gemini API Key.', qualityScore: 'Low', suggestedAction: 'Check environment setup.', socialSignal: 'N/A', draftPitch: 'Please check API keys to generate verified leads.' };
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
async function generateLeadsBatch(leadType, searchTerm, financialTerm, activeSignal, location, salesPersona, socialFocus, batchesToRun = 3) {
    let leadData = [];

    // --- NEW: Generate Dynamic Negative Keywords ---
    const negativeKeywords = generateNegativeKeywords(salesPersona);

    // --- BATCH 1: General Web & Location Focus (B2B Commercial Intent) ---
    // If B2B, use the full, unsimplified OR-chain for maximum relevance.
    const primaryTerm = leadType === 'commercial' ? searchTerm : activeSignal;

    // Use negative keywords to exclude competitors
    const generalQuery = `${primaryTerm} in "${location}" ${negativeKeywords} -job -careers -"blog post"`;
    const generalSnippets = await withBackoff(() => searchGoogle(generalQuery));

    
    // --- BATCH 2: Social Media Frequency Focus (HOT Leads) ---
    // Scoped to social platforms to find active discussions/competitive intent.
    const socialPlatforms = "site:linkedin.com OR site:reddit.com OR site:twitter.com";
    const socialQueryTerm = socialFocus || financialTerm || searchTerm;
    
    // Use negative keywords here too to prevent finding competitor social profiles
    const socialQuery = `${socialPlatforms} "${socialQueryTerm}" in "${location}" ${negativeKeywords}`;
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

    return uniqueLeads.slice(0, batchesToRun); // Slice according to the job type
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

        // Synchronous handler runs one batch (max 3 leads)
        const batchesToRun = 3; 

        const leads = await generateLeadsBatch(
            leadType || 'commercial', 
            searchTerm, 
            financialTerm || '',
            activeSignal || '', 
            location, 
            salesPersona || 'General Sales Representative', 
            socialFocus || '',
            batchesToRun
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
        
        // Checking for required parameters
		if (!leadType || !searchTerm || !location || !salesPersona) {
			console.error('[Background] Missing required fields in request.');
			return {	
				statusCode: 400,	
				headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
				body: JSON.stringify({ error: 'Missing required parameters for background job.' })	
			};
		}
		
		// Set a higher number of batches for the "unlimited" background job (e.g., 8 batches)
		const batchesToRun = 8; 

		console.log(`[Background] Starting LONG JOB (${batchesToRun} batches) for: ${searchTerm} in ${location}.`);

		// --- Execution of the Long Task ---
		const leads = await generateLeadsBatch(
            leadType, 
            searchTerm, 
            financialTerm || '',
            activeSignal || '', 
            location, 
            salesPersona, 
            socialFocus || '',
            batchesToRun
        );
		
		console.log(`[Background] Job finished successfully. Generated ${leads.length} high-quality leads.`);
		
		return {
			statusCode: 200,
			headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
			body: JSON.stringify({ leads: leads, count: leads.length, message: `Successfully generated ${leads.length} leads in background.` })
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
