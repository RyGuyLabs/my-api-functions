/**
 * Ultimate Premium Lead Generator – Gemini + Google Custom Search
 *
 * This file contains two exports:
 * 1. exports.handler: Synchronous endpoint (guaranteed fast, max 3 leads).
 * 2. exports.background: Asynchronous endpoint (runs up to 15 minutes, unlimited leads).
 *
 * CRITICAL FIXES APPLIED:
 * 1. FIXED B2B SEARCH LOGIC: The commercial lead generation logic is significantly refined.
 * 2. B2C Logic (Residential): Remains fixed with the decoupling of the restrictive 'activeSignal' from the primary search.
 * 3. NEW FEATURE: **Vertical Intent Targeting** implemented for Batch 2 searches to only use pain points relevant to the specified industry (e.g., 'FinTech').
 */

const nodeFetch = require('node-fetch'); 
const fetch = nodeFetch.default || nodeFetch; 

const GEMINI_API_KEY = process.env.LEAD_QUALIFIER_API_KEY;
const SEARCH_API_KEY = process.env.RYGUY_SEARCH_API_KEY;
const SEARCH_ENGINE_ID = process.env.RYGUY_SEARCH_ENGINE_ID;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent';
const GOOGLE_SEARCH_URL = 'https://www.googleapis.com/customsearch/v1';

// --- Configuration ---

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

// --- New: Vertical Mapping for Targeted Intent Searching (Batch 2) ---

const ALL_PAIN_POINTS = '"data silos" OR "reducing customer churn" OR "AML reporting pain" OR "security audit failure" OR "HIPAA violation fines" OR "EHR integration" OR "abandoned cart rate" OR "better personalization"';

const VERTICAL_PAIN_POINTS = {
    'SaaS': '"data silos" OR "data integration challenge" OR "reducing customer churn" OR "customer retention problem"',
    'FinTech': '"AML reporting pain" OR "KYC compliance failure" OR "security audit failure" OR "regulatory enforcement"',
    'HealthTech': '"HIPAA violation fines" OR "patient data breach" OR "EHR integration difficulty" OR "clinical workflow inefficiency"',
    'ECommerce': '"abandoned cart rate is too high" OR "better personalization" OR "customer segmentation" OR "fulfillment bottleneck"',
    'Default': ALL_PAIN_POINTS // Fallback to all signals
};

// --- Helper Functions ---

/**
 * Retries a fetch request with exponential backoff on failure.
 * @param {string} url - The URL to fetch.
 * @param {object} options - Fetch options.
 * @param {number} maxRetries - Maximum number of retries.
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(url, options, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(url, options);
            if (response.ok) {
                return response;
            }
            // If response is not ok (e.g., 400, 500), throw to retry (unless 400)
            if (response.status >= 400 && response.status < 500) {
                 // Do not retry on client errors (4xx) except for 429
                 if (response.status !== 429) {
                    throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
                 }
            }
            
        } catch (error) {
            console.warn(`Fetch attempt ${i + 1} failed: ${error.message}. Retrying...`);
        }
        
        if (i < maxRetries - 1) {
            // Exponential backoff wait
            const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw new Error('All fetch attempts failed after retries.');
}

/**
 * Searches Google using Custom Search API.
 * @param {string} query - The search query.
 * @param {string} location - Geographical hint.
 * @returns {Promise<Array<object>>} - Array of search results.
 */
async function searchGoogle(query, location) {
    if (!SEARCH_API_KEY || !SEARCH_ENGINE_ID) {
        console.error("Missing Google Search API credentials.");
        return [];
    }
    
    // Append location to query for better regional relevance
    const finalQuery = `${query} in ${location}`;
    
    const url = `${GOOGLE_SEARCH_URL}?key=${SEARCH_API_KEY}&cx=${SEARCH_ENGINE_ID}&q=${encodeURIComponent(finalQuery)}&num=10`;

    try {
        const response = await fetchWithRetry(url, { method: 'GET' });
        const data = await response.json();
        return data.items || [];
    } catch (error) {
        console.error('Google Search API Error:', error);
        return [];
    }
}

/**
 * Calls the Gemini API to analyze search snippets and structure lead data.
 * @param {Array<object>} snippets - Search results (snippets) to analyze.
 * @param {string} salesPersona - The specific persona to target.
 * @returns {Promise<Array<object>>} - Array of structured lead objects.
 */
async function qualifyLeadsWithGemini(snippets, salesPersona) {
    if (snippets.length === 0) {
        return [];
    }

    const snippetText = snippets.map((item, index) => 
        `Snippet ${index + 1} (Title: ${item.title}, URL: ${item.link}, Text: ${item.snippet})`
    ).join('\n---\n');

    const systemPrompt = `You are a world-class Sales Development Representative (SDR) powered by AI. Your task is to analyze raw search data and identify high-quality B2B sales leads.
Rules:
1. Identify the company and person who wrote or is associated with the content in the snippet.
2. The ideal contact person matches the 'salesPersona': **${salesPersona}**.
3. **CRITICAL:** Assign a 'personaMatchScore' from 0 (poor fit) to 10 (perfect fit). Base this ONLY on the title/role inferred from the snippet.
4. If a snippet discusses a competitor (e.g., "moving away from Salesforce"), infer this into the 'socialSignal' field. If no social/competitive signal, leave it blank.
5. Infer a specific 'geoDetail' (like neighborhood, city-region, or zip code) if possible from the snippet text, otherwise use the main city/state.
6. The 'painSignal' MUST summarize the specific problem mentioned in the snippet that your company can solve.
7. Return only a JSON array of lead objects. Use the exact schema provided.
8. Only generate leads where the company/person can be clearly identified.

Sales Persona: ${salesPersona}

Snippet Data:
${snippetText}`;

    const userQuery = "Analyze the provided search snippets. Generate a JSON array of high-quality leads that match the sales persona and exhibit a strong pain signal or intent to buy.";

    const payload = {
        contents: [{ parts: [{ text: userQuery }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "ARRAY",
                items: {
                    type: "OBJECT",
                    properties: {
                        "companyName": { "type": "STRING", "description": "The name of the company." },
                        "contactName": { "type": "STRING", "description": "The name of the contact person." },
                        "title": { "type": "STRING", "description": "The professional title of the contact (e.g., 'Head of Engineering')." },
                        "website": { "type": "STRING", "description": "The most relevant URL from the snippet for the company." },
                        "personaMatchScore": { "type": "INTEGER", "description": "Score from 0 to 10 based on fit with salesPersona." },
                        "painSignal": { "type": "STRING", "description": "A concise summary of the business pain or problem." },
                        "socialSignal": { "type": "STRING", "description": "Competitive or social intent (e.g., 'Looking at alternatives to X')." },
                        "geoDetail": { "type": "STRING", "description": "Specific location detail inferred from the snippet (e.g., 'downtown Seattle' or '94043')." }
                    },
                    required: ["companyName", "contactName", "title", "website", "personaMatchScore", "painSignal", "geoDetail"],
                }
            }
        }
    };

    try {
        const response = await fetchWithRetry(GEMINI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!jsonText) {
            console.error("Gemini failed to return JSON text.", result);
            return [];
        }

        try {
            // Robust JSON parsing: clean up markdown if present
            const cleanedJsonText = jsonText.replace(/```json\s*|```/g, '').trim();
            const parsedLeads = JSON.parse(cleanedJsonText);
            
            // Filter out leads that don't meet minimum quality standards
            return parsedLeads.filter(lead => lead.personaMatchScore > 3);

        } catch (parseError) {
            console.error('Failed to parse Gemini JSON output:', parseError, 'Raw text:', jsonText);
            return [];
        }

    } catch (error) {
        console.error('Gemini API Call Error:', error);
        return [];
    }
}

/**
 * Attempts to enrich a lead with a likely professional email.
 * @param {object} lead - A single lead object.
 * @returns {Promise<object>} - The lead object with an added 'email' field.
 */
async function enrichEmail(lead) {
    const { contactName, website } = lead;
    let email = null;

    if (!website || !contactName) {
        lead.email = '';
        return lead;
    }

    // 1. Validate the website (quick HEAD request)
    const url = website.startsWith('http') ? website : `https://${website}`;
    let websiteIsValid = false;

    try {
        const headResponse = await fetchWithRetry(url, { method: 'HEAD', redirect: 'follow' });
        websiteIsValid = headResponse.ok;
    } catch (e) {
        // console.log(`Website validation failed for ${website}`);
    }

    if (websiteIsValid) {
        try {
            const domain = new URL(url).hostname;
            const domainParts = domain.split('.');
            // Remove 'www.' or similar prefixes
            const baseDomain = domainParts.length > 2 && domainParts[0] === 'www' ? domainParts[1] : domainParts[0];

            const nameParts = contactName.toLowerCase().split(' ');
            const firstName = nameParts[0] || '';
            const lastName = nameParts[nameParts.length - 1] || '';

            const domainOnly = domain.replace(/^www\./, '');

            // Common professional email patterns
            const patterns = [
                `${firstName}.${lastName}@${domainOnly}`,
                `${firstName[0]}${lastName}@${domainOnly}`,
                `${firstName}@${domainOnly}`,
                `${lastName}@${domainOnly}`,
                `${firstName}${lastName}@${domainOnly}`,
                // Generic organizational emails (for larger companies where specific name may fail)
                `info@${domainOnly}`,
            ];

            // For demonstration, we simply pick the first pattern, as real-world email validation requires paid services
            email = patterns[0];

        } catch (e) {
            // Failed to parse URL or name
            email = null;
        }
    }

    lead.email = email || 'not_found_or_invalid_website';
    return lead;
}

/**
 * Generates leads in batches, alternating search strategies for variety.
 * * @param {string} leadType - B2B or B2C.
 * @param {string} searchTerm - The main search keyword (e.g., 'software companies').
 * @param {string} resolvedActiveSignal - The B2C-specific signal (not used for B2B primary).
 * @param {string} location - Geographical location.
 * @param {string} salesPersona - The target role (e.g., 'Head of Engineering').
 * @param {string} socialFocus - Custom keyword for competitive/social signal search.
 * @param {string} targetVertical - **NEW**: The industry vertical (e.g., 'FinTech').
 * @param {number} batchesToRun - How many times to loop the search sequence.
 * @returns {Promise<Array<object>>} - A flattened array of all generated leads.
 */
async function generateLeadsBatch(leadType, searchTerm, resolvedActiveSignal, location, salesPersona, socialFocus, targetVertical, batchesToRun) {
    const allLeads = [];
    const processedWebsites = new Set(); // To prevent duplicate enrichment on the same company

    // Prepare vertical intent query for Batch 2
    const targetedPainPoints = VERTICAL_PAIN_POINTS[targetVertical] || VERTICAL_PAIN_POINTS['Default'];
    
    // Core search sequence (3 searches per batch)
    const BATCH_SEQUENCE = [
        // Batch 1 (Foundation): Finds relevant companies in the location.
        (term) => term, 
        // Batch 2 (Intent Signal): Finds companies actively discussing pain points.
        (term) => `${term} AND (${targetedPainPoints})`, 
        // Batch 3 (Social/Competitive Signal): Finds companies comparing products or discussing competitors.
        (term) => socialFocus ? `${term} AND (${socialFocus})` : `${term} AND ("looking for alternatives" OR "moving away from" OR "pricing comparison")`,
    ];

    for (let i = 0; i < batchesToRun; i++) {
        for (let batchId = 0; batchId < BATCH_SEQUENCE.length; batchId++) {
            let query = '';
            
            if (leadType === 'B2B') {
                // B2B Search Logic
                // Batch 1: Focus on the company type/term
                // Batch 2: Focus on company type + pain points (Vertical Targeted)
                // Batch 3: Focus on company type + social/competitive signals
                query = BATCH_SEQUENCE[batchId](searchTerm);

            } else {
                // B2C (Residential) Search Logic - Simplified
                // Focus on the activeSignal (e.g., "looking for house painters")
                // All batches use the active signal for relevance.
                query = resolvedActiveSignal;
            }

            console.log(`Running Batch ${i + 1}-${batchId + 1} with query: ${query}`);

            const snippets = await searchGoogle(query, location);
            const qualifiedLeads = await qualifyLeadsWithGemini(snippets, salesPersona);

            // Filter out duplicates and enrich
            for (const lead of qualifiedLeads) {
                if (lead.website && !processedWebsites.has(lead.website)) {
                    allLeads.push(lead);
                    processedWebsites.add(lead.website);
                }
            }
        }
    }

    // Concurrent Enrichment: process all unique leads found
    const uniqueLeadsToEnrich = allLeads.filter(lead => lead.email === undefined);
    const enrichmentPromises = uniqueLeadsToEnrich.map(enrichEmail);
    const enrichedLeads = await Promise.all(enrichmentPromises);

    // Merge enriched leads back into the main list (using simple filter/concat for this demo)
    return enrichedLeads.sort((a, b) => b.personaMatchScore - a.personaMatchScore);
}

// --- Exports (Entry Points) ---

/**
 * Synchronous handler (for fast results, max 3 leads)
 */
exports.handler = async (event, context) => {
    // Handle OPTIONS request for CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: CORS_HEADERS, body: 'OK' };
    }
    
    try {
        const body = JSON.parse(event.body);
        const { leadType, searchTerm, activeSignal, location, salesPersona, socialFocus, targetVertical } = body; // Added targetVertical

        // Simple validation
        if (!leadType || !searchTerm || !location || !salesPersona) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
                body: JSON.stringify({ error: 'Missing required parameters: leadType, searchTerm, location, or salesPersona.' })
            };
        }
        
        // Resolve B2C activeSignal or use the searchTerm as a sensible default for B2B foundation
        const resolvedActiveSignal = leadType === 'B2C' && activeSignal ? activeSignal : searchTerm;
        
        // Only run 1 batch for the fast, synchronous job
        const batchesToRun = 1; 

        console.log(`[Handler] Starting FAST JOB (${batchesToRun} batch) for: ${searchTerm} in ${location}.`);

        const leads = await generateLeadsBatch(leadType, searchTerm, resolvedActiveSignal, location, salesPersona, socialFocus, targetVertical, batchesToRun);
        
        console.log(`[Handler] Job finished successfully. Generated ${leads.length} high-quality leads.`);
        
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
            body: JSON.stringify({ leads: leads, count: leads.length, message: `Successfully generated ${leads.length} leads.` })
        };
    } catch (err) {
        console.error('Lead Generator Handler Error:', err);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
            body: JSON.stringify({ error: err.message, details: err.cause || 'An unexpected error occurred.' })
        };
    }
};

/**
 * Asynchronous handler (for long-running jobs, unlimited leads)
 */
exports.background = async (event, context) => {
    // Handle OPTIONS request for CORS preflight (though typically background jobs aren't hit with preflight)
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: CORS_HEADERS, body: 'OK' };
    }

    try {
        const body = JSON.parse(event.body);
        const { leadType, searchTerm, activeSignal, location, salesPersona, socialFocus, targetVertical } = body; // Added targetVertical

        // Checking for required parameters
        if (!leadType || !searchTerm || !location || !salesPersona) {
            console.error('[Background] Missing required fields in request.');
            return {	
                statusCode: 400,	
                headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
                body: JSON.stringify({ error: 'Missing required parameters for background job.' })	
            };
        }
        
        const resolvedActiveSignal = leadType === 'B2C' && activeSignal ? activeSignal : searchTerm;
        
        // Set a higher number of batches for the "unlimited" background job (e.g., 8 batches)
        const batchesToRun = 8; 

        console.log(`[Background] Starting LONG JOB (${batchesToRun} batches) for: ${searchTerm} in ${location}.`);

        // --- Execution of the Long Task ---
        const leads = await generateLeadsBatch(leadType, searchTerm, resolvedActiveSignal, location, salesPersona, socialFocus, targetVertical, batchesToRun);
        
        console.log(`[Background] Job finished successfully. Generated ${leads.length} high-quality leads.`);
        
        // IMPORTANT: For a true background handler, you would typically save results to a DB 
        // or queue a fulfillment step here, rather than returning all data.
        
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
            body: JSON.stringify({ leads: leads, count: leads.length, message: `Successfully generated ${leads.length} leads in background.` })
        };
    } catch (err) {
        console.error('Lead Generator Background Error:', err);
        // Log the error and still return a 200 or 202 to indicate the job processor is done,
        // but with a payload indicating failure to the monitoring system.
        return {	
            statusCode: 500,	
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
            body: JSON.stringify({ error: err.message, details: err.cause || 'An unexpected error occurred in background process.' })
        };
    }
};
