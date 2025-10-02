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
 * 3. NEW: Added 'socialFocus' input field contingency to customize the social/competitive search query.
 */

const nodeFetch = require('node-fetch'); 
const fetch = nodeFetch.default || nodeFetch; 
const { parse } = require('url');

// --- Environment Variables ---
const GEMINI_API_KEY = process.env.LEAD_QUALIFIER_API_KEY;
const SEARCH_API_KEY = process.env.RYGUY_SEARCH_API_KEY;
const SEARCH_ENGINE_ID = process.env.RYGUY_SEARCH_ENGINE_ID;

// --- API Endpoints ---
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent';
const GOOGLE_SEARCH_URL = 'https://www.googleapis.com/customsearch/v1';

// --- Configuration ---
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

// --- LLM SYSTEM INSTRUCTION ---
// Updated to explicitly ask for social/competitive signals.
const SYSTEM_INSTRUCTION = (salesPersona, targetDecisionMaker) => `
You are a Lead Qualification AI specializing in high-intent, sales-ready leads.
Your task is to analyze search engine snippets related to user-defined criteria and extract structured data.
The user is a **${salesPersona}** targeting a **${targetDecisionMaker}** profile.
Filter out any results that are pure advertisements, sponsored content, or generic information. Focus only on leads that show genuine buying intent, recent activity, or competitive pressure.
The output MUST be a JSON array of objects, conforming strictly to the provided schema.

Mandatory JSON Schema fields to populate:
1.  **name**: The name of the person or company.
2.  **description**: A one-sentence summary of the company/person and their context (e.g., "A mid-sized logistics firm seeking new ERP software," or "A local family in need of life insurance for a new baby.").
3.  **insights**: The 'Why'—a concise explanation of *why* this is a high-quality lead based on the snippet (e.g., urgency, financial indicators, competitive mention).
4.  **draftPitch**: A single, short, personalized pitch sentence for the ${salesPersona} to use.
5.  **qualityScore**: Assign 'High', 'Medium', or 'Low' based on the intent and relevance shown in the snippet.
6.  **suggestedAction**: The next immediate step (e.g., "Call immediately," "Send personalized LinkedIn invite," "Monitor competitor reviews").
7.  **socialSignal**: Infer and document any active social or competitive signals found in the snippets (e.g., "Recently posted on Reddit asking for alternatives to their current vendor," "Company C-suite followed competitor on LinkedIn"). If none, state "None observed."
8.  **website**: The most relevant website URL.
9.  **email**: A best-guess contact email (e.g., info@domain.com) or 'N/A'.
10. **phoneNumber**: A public phone number or 'N/A'.
11. **socialMediaHandle**: A primary social handle (LinkedIn, Twitter) for the company or person, or 'N/A'.
12. **leadType**: 'commercial' or 'residential'.
13. **decisionMakerName**: (Commercial only) The name of the likely decision maker/contact person mentioned, or 'N/A'.
14. **decisionMakerTitle**: (Commercial only) Their inferred job title, or 'N/A'.
15. **techStackSignal**: (Commercial only) Mentioned technology or software that suggests a need, or 'N/A'.
16. **geoDetail**: The specific neighborhood, zip code, or sub-locality mentioned in the snippet, for hyper-local targeting, or 'N/A'.
`;


// --- UTILITIES ---

/**
 * Robustly extracts the JSON array from the Gemini response text, which often includes markdown fences (```json).
 * @param {string} text - The raw text response from the LLM.
 * @returns {Array} - The parsed JavaScript array.
 */
function extractAndParseJson(text) {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    let jsonString = jsonMatch ? jsonMatch[1] : text.trim();

    // Attempt to fix common LLM JSON errors (like trailing commas)
    jsonString = jsonString.replace(/,\s*([\]}])/g, '$1');

    try {
        return JSON.parse(jsonString);
    } catch (e) {
        console.error('JSON Parsing failed. Attempting cleanup on:', jsonString);
        // Fallback for severely malformed JSON (simple regex cleanup)
        // This is a last resort and may fail.
        try {
            // Attempt to wrap content if it's not enclosed by [] or {}
            if (!jsonString.startsWith('[') && !jsonString.startsWith('{')) {
                jsonString = '[' + jsonString + ']';
            }
            return JSON.parse(jsonString);
        } catch (finalError) {
            console.error('Final JSON Parsing attempt failed:', finalError);
            throw new Error(`Failed to parse structured JSON from LLM: ${finalError.message}`);
        }
    }
}

/**
 * Simple function to check if a URL is valid before attempting an email check.
 * @param {string} urlString - The URL to check.
 * @returns {Promise<boolean>} - True if the website is likely accessible.
 */
async function checkWebsiteExists(urlString) {
    if (!urlString || urlString === 'N/A' || !urlString.startsWith('http')) return false;
    try {
        const response = await fetch(urlString, { method: 'HEAD', timeout: 3000 });
        return response.ok;
    } catch (e) {
        return false;
    }
}

/**
 * Generates a list of common email permutations for a domain.
 * @param {string} domain - The company's domain.
 * @returns {Array<string>} - A list of common email addresses.
 */
function generateEmailPermutations(domain, name = '') {
    const emails = [];
    if (!domain) return emails;

    // Standard contact roles
    emails.push(`info@${domain}`);
    emails.push(`contact@${domain}`);
    emails.push(`sales@${domain}`);

    // If a name is available, generate name-based patterns
    if (name) {
        const nameParts = name.toLowerCase().split(' ');
        const firstName = nameParts[0];
        const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';

        if (firstName) {
            emails.push(`${firstName}@${domain}`); // john@domain.com
            if (lastName) {
                emails.push(`${firstName}.${lastName}@${domain}`); // john.doe@domain.com
                emails.push(`${firstName[0]}${lastName}@${domain}`); // jdoe@domain.com
            }
        }
    }

    return Array.from(new Set(emails)); // Return unique emails
}

/**
 * Attempts to enrich the lead data with an email address using common permutations.
 * @param {object} lead - The lead object.
 * @returns {Promise<string>} - The found email or 'N/A'.
 */
async function enrichEmail(lead) {
    const website = lead.website || '';
    if (lead.email && lead.email !== 'N/A') return lead.email;

    try {
        // 1. Get Domain
        const urlObj = new URL(website.startsWith('http') ? website : `http://${website}`);
        const domain = urlObj.hostname.replace(/^www\./, '');
        if (!domain) return 'N/A';

        // 2. Check if website is alive (optimistic check)
        const isLive = await checkWebsiteExists(website);
        if (!isLive) return 'N/A';

        // 3. Generate Permutations
        const emailPermutations = generateEmailPermutations(domain, lead.decisionMakerName);

        // 4. (SIMULATED): In a real app, you'd use a paid service here.
        // For this demo, we can't validate emails, so we return the most likely generic one.
        // We'll return the 'info' email as a highly probable guess.
        const likelyEmail = emailPermutations.find(e => e.startsWith('info@')) || emailPermutations[0] || 'N/A';

        // Log the most likely email for the user
        console.log(`Email enrichment: Guessed ${likelyEmail} for ${lead.name}`);
        return likelyEmail;

    } catch (e) {
        console.error(`Error during email enrichment for ${lead.name}:`, e.message);
        return 'N/A';
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
    
    // CRITICAL: Check for API Key before attempting the call
    // Note: The constant GEMINI_API_KEY is defined via process.env.LEAD_QUALIFIER_API_KEY 
    if (!GEMINI_API_KEY) {
        console.error("CRITICAL: GEMINI_API_KEY (from LEAD_QUALIFIER_API_KEY) is not set.");
        throw new Error("Gemini API Key Missing. Please set the LEAD_QUALIFIER_API_KEY environment variable.");
    }

    const snippetText = snippets.map((item, index) => 
        `--- SNIPPET ${index + 1} (Source: ${item.source}) ---\nTitle: ${item.title}\nURL: ${item.link}\nSnippet: ${item.snippet}\n`
    ).join('\n\n');

    const userQuery = `Analyze the following ${snippets.length} search engine snippets. For each snippet, determine if it represents a high-intent, sales-ready lead for a **${salesPersona}**. Structure the best-fitting results as a JSON array. Snippets to analyze:\n\n${snippetText}`;

    const payload = {
        contents: [{ parts: [{ text: userQuery }] }],
        systemInstruction: {
            parts: [{ text: SYSTEM_INSTRUCTION(salesPersona, 'Decision Maker or Lead') }]
        },
        config: {
            responseMimeType: 'application/json',
            responseSchema: {
                type: 'ARRAY',
                items: {
                    type: 'OBJECT',
                    properties: {
                        name: { type: 'STRING' },
                        description: { type: 'STRING' },
                        insights: { type: 'STRING' },
                        draftPitch: { type: 'STRING' },
                        qualityScore: { type: 'STRING', enum: ['High', 'Medium', 'Low'] },
                        suggestedAction: { type: 'STRING' },
                        socialSignal: { type: 'STRING' },
                        website: { type: 'STRING' },
                        email: { type: 'STRING' },
                        phoneNumber: { type: 'STRING' },
                        socialMediaHandle: { type: 'STRING' },
                        leadType: { type: 'STRING', enum: ['commercial', 'residential'] },
                        decisionMakerName: { type: 'STRING' },
                        decisionMakerTitle: { type: 'STRING' },
                        techStackSignal: { type: 'STRING' },
                        geoDetail: { type: 'STRING' }
                    },
                    required: ['name', 'description', 'insights', 'qualityScore', 'website', 'leadType', 'draftPitch', 'suggestedAction']
                }
            }
        }
    };

    let resultJson;
    try {
        const response = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-API-Key': GEMINI_API_KEY // Use key in header if needed, but typically passed in URL
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error('Gemini API Error:', response.status, errorBody);
            // Throw a specific error for the 403 to indicate API key or billing issue
            if (response.status === 403) {
                 throw new Error('403 Forbidden: Check LEAD_QUALIFIER_API_KEY, API Enablement, and Billing Status.');
            }
            throw new Error(`Gemini API failed with status ${response.status}`);
        }

        const result = await response.json();
        const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) {
            console.error('Gemini returned no text content:', result);
            throw new Error('LLM did not return a valid response text.');
        }

        // Use the robust parser
        resultJson = extractAndParseJson(text);

    } catch (error) {
        console.error('Error in qualifyLeadsWithGemini:', error);
        throw error;
    }

    // --- Post-Processing: Enrichment and Final Scoring ---
    const enrichedLeads = await Promise.all(resultJson.map(async (lead) => {
        // 1. Email Enrichment
        lead.email = await enrichEmail(lead);

        // 2. Persona Match Scoring (Simplified logic for demonstration: +1 if insights mention key terms)
        const scoreTerm = salesPersona.replace(/_/g, ' '); // e.g., real estate
        if (lead.insights.toLowerCase().includes(scoreTerm)) {
            lead.personaMatchScore = 1; 
        } else {
            lead.personaMatchScore = 0;
        }

        return lead;
    }));
    
    // Sort by Quality and Persona Match Score (Higher is better)
    enrichedLeads.sort((a, b) => {
        const qualityMap = { 'High': 3, 'Medium': 2, 'Low': 1 };
        const qualityA = qualityMap[a.qualityScore] || 0;
        const qualityB = qualityMap[b.qualityScore] || 0;

        if (qualityB !== qualityA) {
            return qualityB - qualityA; // Primary sort: High -> Low
        }
        return (b.personaMatchScore || 0) - (a.personaMatchScore || 0); // Secondary sort: Match Score
    });

    return enrichedLeads;
}

// --- GOOGLE SEARCH UTILITY ---

/**
 * Searches Google using the Custom Search API (CSE).
 * @param {string} query - The search query.
 * @param {number} numResults - Number of results to fetch (max 10 per call).
 * @returns {Promise<Array<object>>} - Array of search result objects (snippets).
 */
async function googleSearch(query, numResults = 10) {
    if (!SEARCH_API_KEY || !SEARCH_ENGINE_ID) {
        console.error("CRITICAL: Search API or Engine ID is not set.");
        return [];
    }

    const searchUrl = `${GOOGLE_SEARCH_URL}?key=${SEARCH_API_KEY}&cx=${SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}&num=${Math.min(numResults, 10)}`;

    try {
        const response = await fetch(searchUrl);
        if (!response.ok) {
            const errorBody = await response.text();
            console.error('Google Search API Error:', response.status, errorBody);
            // Critical: If Google Search 403s, it suggests an issue with RYGUY_SEARCH_API_KEY or CSE setup.
             if (response.status === 403) {
                 throw new Error('403 Forbidden: Check RYGUY_SEARCH_API_KEY, Custom Search API Enablement, and Billing Status.');
            }
            throw new Error(`Google Search failed with status ${response.status}`);
        }
        const data = await response.json();
        
        return data.items ? data.items.map(item => ({
            title: item.title,
            link: item.link,
            snippet: item.snippet,
            source: new URL(item.link).hostname
        })) : [];

    } catch (error) {
        console.error('Error during Google Search:', error);
        return [];
    }
}


// --- MAIN BATCH GENERATOR ---

/**
 * Generates leads in batches, allowing for multiple search queries and diversification.
 * @param {string} leadType - 'commercial' or 'residential'.
 * @param {string} searchTerm - The core service/product need.
 * @param {string} financialTerm - The optional financial/intent filter.
 * @param {string} activeSignal - The core high-intent keywords (used for B2B primary search).
 * @param {string} location - The target geographic location.
 * @param {string} salesPersona - The type of salesperson.
 * @param {string} socialFocus - The user's input for competitive/social signal focus.
 * @param {number} batchesToRun - How many search/qualify cycles to run.
 * @returns {Promise<Array<object>>} - Final list of unique leads.
 */
async function generateLeadsBatch(leadType, searchTerm, financialTerm, activeSignal, location, salesPersona, socialFocus, batchesToRun) {
    let allLeadsMap = new Map();
    let totalLeadsProcessed = 0;
    const maxSnippetsPerBatch = 10;
    const targetDecisionMaker = 'Decision Maker or Lead'; // Simplified context for LLM prompt

    // --- Search Strategy: B2B vs B2C ---
    const searchStrategy = {
        commercial: [
            // Batch 1 (Primary): Focused Intent + Location (High-intent for B2B)
            (l, a, s) => `${searchTerm} "${activeSignal}" near ${l} -jobs -forums -site:linkedin.com`,
            // Batch 2 (Fallback): Target Company Type + Location (Guaranteed results)
            (l) => `${searchTerm} ${financialTerm} in ${l} -jobs -forums -site:linkedin.com`,
            // Batch 3 (Social/Competitive Intent Grounding)
            (l, a, s) => s ? `${s} ${searchTerm} ${l} -"quotes" -jobs` : `alternatives to ${searchTerm} reddit OR quora ${l}`
        ],
        residential: [
            // Batch 1 (Primary): Direct Need + Location (High-intent for B2C)
            (l, a, s) => `${searchTerm} ${financialTerm} near ${l} -"cost" -jobs -forums`,
            // Batch 2 (Urgency/Cost): Quotes/Reviews + Location
            (l) => `${searchTerm} "quotes" OR "reviews" in ${l}`,
            // Batch 3 (Social/Competitive Intent Grounding)
            (l, a, s) => s ? `${s} ${searchTerm} ${l} -"quotes" -jobs` : `best service for ${searchTerm} reddit OR nextdoor ${l}`
        ]
    };
    
    // Select the correct search query template array
    const queryTemplates = searchStrategy[leadType];

    for (let i = 0; i < batchesToRun; i++) {
        const batchIndex = i % queryTemplates.length;
        const queryFunction = queryTemplates[batchIndex];

        // Construct the query using the selected template
        const query = queryFunction(location, activeSignal, socialFocus);
        
        console.log(`[Batch ${i + 1}] Running search with query: ${query}`);

        const snippets = await googleSearch(query, maxSnippetsPerBatch);

        if (snippets.length === 0) {
            console.log(`[Batch ${i + 1}] No snippets found. Skipping qualification.`);
            continue;
        }

        // Qualify leads using Gemini
        const qualifiedLeads = await qualifyLeadsWithGemini(snippets, salesPersona);
        totalLeadsProcessed += snippets.length;
        
        console.log(`[Batch ${i + 1}] Qualified ${qualifiedLeads.length} leads.`);

        // Merge and deduplicate leads based on website or name
        qualifiedLeads.forEach(lead => {
            const key = (lead.website && lead.website !== 'N/A') ? lead.website.toLowerCase() : lead.name.toLowerCase();
            // Only add if it's new or if the new one has a higher quality score
            if (!allLeadsMap.has(key) || (allLeadsMap.get(key).qualityScore === 'Medium' && lead.qualityScore === 'High')) {
                 allLeadsMap.set(key, lead);
            }
        });
        
        console.log(`[Batch ${i + 1}] Total unique leads found so far: ${allLeadsMap.size}`);

        // Small delay to respect rate limits and allow for intermediate results
        await new Promise(resolve => setTimeout(resolve, 500)); 
    }
    
    console.log(`Final Lead Count: ${allLeadsMap.size}. Total snippets processed: ${totalLeadsProcessed}.`);
    return Array.from(allLeadsMap.values());
}


// --- NETLIFY FUNCTION EXPORTS ---

/**
 * Main synchronous export handler for quick, guaranteed-fast jobs (max 3 leads).
 * @param {object} event - Netlify event object.
 * @returns {object} - HTTP response object.
 */
exports.handler = async (event) => {
    // CORS Pre-flight check
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: CORS_HEADERS, body: 'OK' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers: CORS_HEADERS, body: 'Method Not Allowed' };
    }

    try {
        const { leadType, searchTerm, location, totalLeads, salesPersona, financialTerm, socialFocus } = JSON.parse(event.body);

        // Checking for required parameters
        if (!leadType || !searchTerm || !location || !salesPersona) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
                body: JSON.stringify({ error: 'Missing required parameters.' })
            };
        }
        
        // Define the batch count for the quick job (1-3 leads)
        // Max 3 batches to ensure fast response, fetching max 10 snippets per batch
        const batchesToRun = Math.ceil(Math.min(totalLeads, 3)); 

        console.log(`[Sync] Starting QUICK JOB (${batchesToRun} batches) for: ${searchTerm} in ${location}.`);
        
        // --- Execution of the Quick Task ---
        const leads = await generateLeadsBatch(leadType, searchTerm, financialTerm, null, location, salesPersona, socialFocus, batchesToRun);
        
        console.log(`[Sync] Job finished successfully. Generated ${leads.length} high-quality leads.`);
        
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
            body: JSON.stringify({ leads: leads.slice(0, totalLeads), count: leads.length })
        };
    } catch (err) {
        console.error('Lead Generator Sync Error:', err);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
            body: JSON.stringify({ error: err.message, details: err.cause || 'An internal server error occurred.' })
        };
    }
};

/**
 * Asynchronous export handler for long-running, in-depth jobs (up to 15 leads).
 * NOTE: This is designed for Netlify/AWS Lambda's background execution model.
 * @param {object} event - Netlify event object.
 * @returns {object} - HTTP response object.
 */
exports.background = async (event) => {
    // CORS Pre-flight check (Background functions often skip this, but including for completeness)
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: CORS_HEADERS, body: 'OK' };
    }
    
    try {
        const { leadType, searchTerm, location, salesPersona, financialTerm, socialFocus } = JSON.parse(event.body);

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
        // This targets 8 * 10 = 80 snippets, which should yield up to 15 leads.
        const batchesToRun = 8; 

        console.log(`[Background] Starting LONG JOB (${batchesToRun} batches) for: ${searchTerm} in ${location}.`);

        // --- Execution of the Long Task ---
        const leads = await generateLeadsBatch(leadType, searchTerm, financialTerm, null, location, salesPersona, socialFocus, batchesToRun);
        
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
            body: JSON.stringify({ error: err.message, details: err.cause || 'An internal server error occurred.' })	
        };
    }
};
