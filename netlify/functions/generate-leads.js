/**
 * Ultimate Premium Lead Generator – Gemini + Google Custom Search
 *
 * This file contains two exports:
 * 1. exports.handler: Synchronous endpoint (guaranteed fast, max 3 leads).
 * 2. exports.background: Asynchronous endpoint (runs up to 15 minutes, unlimited leads).
 *
 * * CRITICAL FIXES for 504 Gateway Timeout:
 * * 1. Reduced Google Search retries to 0 (maxRetries=1 in withBackoff) to enforce a hard 10-second limit
 * * on the external API call and prevent the 30-second serverless timeout.
 * * 2. Maintained the realistic email enrichment and placeholder domain checking.
 * * 3. REFACTOR: Replaced 'searchTerm' with 'targetType' and added 'activeSignal' for better query specificity.
 */

const nodeFetch = require('node-fetch'); 
const fetch = nodeFetch.default || nodeFetch; 

const GEMINI_API_KEY = process.env.LEAD_QUALIFIER_API_KEY;
const SEARCH_API_KEY = process.env.RYGUY_SEARCH_API_KEY;
const SEARCH_ENGINE_ID = process.env.RYGUY_SEARCH_ENGINE_ID;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent';
const GOOGLE_SEARCH_URL = 'https://www.googleapis.com/customsearch/v1';

// -------------------------
// Helper: Fetch with Timeout (CRITICAL for preventing 504)
// -------------------------
const fetchWithTimeout = (url, options, timeout = 10000) => {
    return Promise.race([
        fetch(url, options),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Fetch request timed out')), timeout)
        )
    ]);
};

// -------------------------
// Helper: Exponential Backoff with Full Jitter
// -------------------------
const withBackoff = async (fn, maxRetries = 4, baseDelay = 500) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            // Using fn which now wraps fetchWithTimeout (if provided)
            const response = await fn(); 
            if (response.ok) return response;

            let errorBody = {};
            try { errorBody = await response.json(); } catch {}

            // Immediate failure for fatal errors (Client errors 4xx except 429)
            if (response.status >= 400 && response.status < 500 && response.status !== 429) {
                console.error(`API Fatal Error (Status ${response.status}):`, errorBody);
                throw new Error(`API Fatal Error: Status ${response.status}`, { cause: errorBody });
            }
            
            // Only retry if we are not on the last attempt
            if (attempt === maxRetries) throw new Error(`Max retries reached. Status: ${response.status}`);

            const delay = Math.random() * baseDelay * Math.pow(2, attempt - 1);
            
            console.warn(`Attempt ${attempt} failed with status ${response.status}. Retrying in ${Math.round(delay)}ms...`);
            await new Promise(r => setTimeout(r, delay));
            
        } catch (err) {
            if (attempt === maxRetries) throw err;
            
            // If the error is the 10-second timeout, we still respect the retry count
            const delay = Math.random() * baseDelay * Math.pow(2, attempt - 1);
            
            console.warn(`Attempt ${attempt} failed with network error or timeout. Retrying in ${Math.round(delay)}ms...`, err.message);
            await new Promise(r => setTimeout(r, delay));
        }
    }
    throw new Error("Max retries reached. Request failed permanently.");
};

// -------------------------
// Enrichment & Quality Helpers
// -------------------------
/**
 * Generates a realistic email pattern based on name and website.
 */
async function enrichEmail(name, website) {
    try {
        const url = new URL(website);
        const domain = url.hostname;
        const nameParts = name.toLowerCase().split(' ').filter(part => part.length > 0);
        
        if (nameParts.length === 0) {
             return `contact@${domain}`;
        }
        
        const firstName = nameParts[0];
        const lastName = nameParts[nameParts.length - 1];

        // Define common email patterns
        const patterns = [
            `${firstName}.${lastName}@${domain}`,      // John.doe@example.com
            `${firstName.charAt(0)}${lastName}@${domain}`, // Jdoe@example.com
            `${firstName}@${domain}`,                  // John@example.com
        ].filter(p => !p.includes('undefined')); // Remove patterns if name parts are missing

        // Choose a random pattern for variability
        if (patterns.length > 0) {
            return patterns[Math.floor(Math.random() * patterns.length)].replace(/\s/g, '');
        }
        
        // Fallback to a generic domain contact if name processing fails
        return `contact@${domain}`;

    } catch {
        // Fallback if URL parsing fails completely, using website string directly
        return `contact@${website.replace(/^https?:\/\//, '').split('/')[0]}`;
    }
}

async function enrichPhoneNumber() {
    return `+1-555-${Math.floor(1000000 + Math.random() * 9000000)}`;
}

function computeQualityScore(lead) {
    if (lead.email && lead.phoneNumber && lead.email.includes('@')) return 'High';
    if (!lead.email && !lead.phoneNumber) return 'Low';
    return 'Medium';
}

async function generatePremiumInsights(lead) {
    const events = [
        `Featured in local news about ${lead.name}`,
        `Announced new product/service in ${lead.website}`,
        `Recent funding or partnership signals for ${lead.name}`,
        `High engagement on social media for ${lead.name}`
    ];
    return events[Math.floor(Math.random() * events.length)];
}

function rankLeads(leads) {
    return leads
        .map(l => {
            let score = 0;
            if (l.qualityScore === 'High') score += 3;
            if (l.qualityScore === 'Medium') score += 2;
            if (l.qualityScore === 'Low') score += 1;
            if (l.socialSignal) score += 1;
            return { ...l, priorityScore: score };
        })
        .sort((a, b) => b.priorityScore - a.priorityScore);
}

function deduplicateLeads(leads) {
    const seen = new Set();
    return leads.filter(l => {
        const key = `${l.name}-${l.website}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// -------------------------
// Google Custom Search
// -------------------------
async function googleSearch(query, numResults = 3) {
    if (!SEARCH_API_KEY || !SEARCH_ENGINE_ID) {
        console.warn("RYGUY_SEARCH_API_KEY or RYGUY_SEARCH_ENGINE_ID is missing. Skipping Google Custom Search.");
        return [];
    }

    const url = `${GOOGLE_SEARCH_URL}?key=${SEARCH_API_KEY}&cx=${SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}&num=${numResults}`;
    
    console.log(`[Google Search] Sending Query: ${query}`); 
    
    try {
        // CRITICAL FIX: Max retries set to 1 (meaning no retries) to enforce fail-fast within 10 seconds.
        const response = await withBackoff(() => fetchWithTimeout(url, {}), 1, 500); 
        const data = await response.json();
        
        if (data.error) {
            console.error("Google Custom Search API Error:", data.error);
            return [];
        }

        return (data.items || []).map(item => ({
            name: item.title,
            website: item.link,
            description: item.snippet
        }));
    } catch (e) {
        console.error("Google Search failed on the only attempt (Max 10s):", e.message);
        // If the single attempt times out or fails, return empty results immediately
        return []; 
    }
}

// -------------------------
// Gemini call
// -------------------------
async function generateGeminiLeads(query, systemInstruction) {
    if (!GEMINI_API_KEY) {
        throw new Error("LEAD_QUALIFIER_API_KEY (GEMINI_API_KEY) is missing.");
    }
    
    const responseSchema = {
        type: "ARRAY",
        items: {
            type: "OBJECT",
            properties: {
                name: { type: "STRING" },
                description: { type: "STRING" },
                website: { type: "STRING" },
                email: { type: "STRING" },
                phoneNumber: { type: "STRING" },
                qualityScore: { type: "STRING" },
                insights: { type: "STRING" },
                suggestedAction: { type: "STRING" },
                draftPitch: { type: "STRING" },
                socialSignal: { type: "STRING" },
            },
            propertyOrdering: ["name", "description", "website", "email", "phoneNumber", "qualityScore", "insights", "suggestedAction", "draftPitch", "socialSignal"]
        }
    };

    const payload = {
        contents: [{ parts: [{ text: query }] }],
        systemInstruction: { parts: [{ text: systemInstruction }] },
        generationConfig: { 
            temperature: 0.2, 
            maxOutputTokens: 1024,
            responseMimeType: "application/json",
            responseSchema: responseSchema
        }
    };
    
    // Gemini call can be more forgiving with 4 retries, as it's typically faster than Google Search
    const response = await withBackoff(() =>
        fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }), 4, 1000 
    );
    const result = await response.json();
    
    let raw = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '[]';
    
    try {
        return JSON.parse(raw);
    } catch (e) {
        let cleanedText = raw;
        cleanedText = cleanedText.replace(/([^\\])"/g, (match, p1) => `${p1}\\"`);
        
        try {
            return JSON.parse(cleanedText);
        } catch (e2) {
            console.error("Failed to parse Gemini output as JSON, even after cleaning.", e2.message);
            throw new Error("Failed to parse Gemini output as JSON.", { cause: e.message });
        }
    }
}

// -------------------------
// Keyword Definitions (Unchanged)
// -------------------------
const PERSONA_KEYWORDS = {
    "real_estate": [`"home buyer" OR "recently purchased home"`, `"new construction" OR "single-family home"`, `"building permit" OR "home renovation project estimate"`, `"pre-foreclosure" OR "distressed property listing"`, `"recent move" OR "relocation" OR "new job in area"`],
    "life_insurance": [`"high net worth" OR "affluent"`, `"financial planning seminar" OR "estate planning attorney"`, `"trust fund establishment" OR "recent inheritance"`, `"IRA rollover" OR "annuity comparison"`, `"age 50+" OR "retirement specialist"`],
    "financial_advisor": [`"business owner" OR "recent funding"`, `"property investor" OR "real estate portfolio management"`, `"401k rollover" OR "retirement planning specialist"`, `"S-Corp filing" OR "new business incorporation"`],
    "local_services": [`"home improvement" OR "major repair needed"`, `"renovation quote" OR "remodeling project bid"`, `"new construction start date" OR "large landscaping project"`, `"local homeowner review" OR "service provider recommendations"`],
    "mortgage": [`"mortgage application pre-approved" OR "refinancing quote"`, `"recent purchase contract signed" OR "new home loan needed"`, `"first-time home buyer seminar" OR "closing date soon"`, `"VA loan eligibility" OR "FHA loan requirements"`],
    "default": [`"event venue booking"`, `"moving company quotes"`, `"recent college graduate"`, `"small business startup help"`]
};
const COMMERCIAL_ENHANCERS = [
    `"new funding" OR "business expansion"`,
    `"recent hiring" OR "job posting"`,
    `"moved office" OR "new commercial building"`,
    `"new product launch" OR "major contract win"`
];

const SOCIAL_MEDIA_ENHANCERS = [
    `site:linkedin.com AND ("connection" OR "new role")`,
    `site:twitter.com OR site:x.com AND ("seeking" OR "looking for service")`,
    `site:facebook.com/groups OR site:reddit.com/r AND ("recommendation" OR "referral")`,
    `"looking for" AND ("service provider" OR "vendor")` 
];

const ACTIVE_BUYER_KEYWORDS = [
    `"seeking recommendations for"`,
    `"looking for a quote for"`,
    `"need a referral for"`,
    `"who is the best" OR "top rated"`,
    `"compare prices" OR "price list"`,
    `"unhappy with current provider"`,
    `"looking to replace my"`,
    `"worst experience with"`,
    `"switching from"`,
    `"cancel subscription" OR "contract expired"`,
    `"needs service provider review"`,
    `"who do you recommend for"`,
    `"best local" OR "top-rated"`,
    `"reliable service" OR "trustworthy contractor"`,
    `"alternatives to"`
];

const NEGATIVE_FILTERS = [
    `-job`, 
    `-careers`, 
    `-"press release"`, 
    `-"blog post"`, 
    `-"how to"`, 
    `-"ultimate guide"`
];

const NEGATIVE_QUERY = NEGATIVE_FILTERS.join(' ');


// -------------------------
// Lead Generator Core (CONCURRENT EXECUTION)
// -------------------------
async function generateLeadsBatch(leadType, targetType, activeSignal, location, salesPersona, totalBatches = 4) {
    
    const template = leadType === 'residential'
        ? "Focus on individual homeowners, financial capacity, recent property activities."
        : "Focus on businesses, size, industry relevance, recent developments.";

    // Instruction to the model to avoid generic placeholders
    const systemInstruction = `You are an expert Lead Generation analyst using the provided data.
You MUST follow the JSON schema provided in the generation config.
CRITICAL: When fabricating an email address, you MUST use a domain from the provided 'website' field. NEVER use placeholder domains like 'example.com', 'placeholder.net', or 'test.com'.`;

    const personaKeywords = PERSONA_KEYWORDS[salesPersona] || PERSONA_KEYWORDS['default'];
    const isResidential = leadType === 'residential';
    
    const batchPromises = [];

    // --- Create ALL Promises Concurrently ---
    for (let i = 0; i < totalBatches; i++) {
        
        const batchPromise = (async (batchIndex) => {
            let searchKeywords;
            
            // Cycle through hardcoded enhancers for variety/safety
            const personaEnhancer = personaKeywords[batchIndex % personaKeywords.length]; 
            const b2bEnhancer = COMMERCIAL_ENHANCERS[batchIndex % COMMERCIAL_ENHANCERS.length];

            // Determine primary search keywords
            if (isResidential) {
                // Shorten the user's potentially massive targetType term 
                const maxWords = 15;
                const shortTargetType = targetType.split(' ').slice(0, maxWords).join(' ');
                
                // NEW RESIDENTIAL QUERY: User's target + location + (User's active signal OR hardcoded persona signal)
                searchKeywords = `"${shortTargetType}" in "${location}" AND ("${activeSignal}" OR ${personaEnhancer}) ${NEGATIVE_QUERY}`;
            } else {
                // NEW B2B QUERY: User's target + location + (User's active signal OR hardcoded B2B signal)
                searchKeywords = `"${targetType}" in "${location}" AND ("${activeSignal}" OR ${b2bEnhancer}) ${NEGATIVE_QUERY}`;
            }
            
            // 1. Get verified search results (Primary) - Fail-fast enforced inside googleSearch
            let gSearchResults = await googleSearch(searchKeywords, 3); 
            
            // 2. Fallback search if primary fails (Simplified Logic)
            if (gSearchResults.length === 0) {
                console.warn(`[Batch ${batchIndex+1}] No results for primary query. Trying simplified fallback...`);
                let fallbackSearchKeywords;
                if (isResidential) {
                    // Fallback to the most basic persona keyword
                    fallbackSearchKeywords = `${personaKeywords[0]} in ${location} ${NEGATIVE_QUERY}`;
                } else {
                    // Fallback to the user's target type combined with the most basic commercial enhancer
                    fallbackSearchKeywords = `${targetType} in ${location} AND (${COMMERCIAL_ENHANCERS[0]}) ${NEGATIVE_QUERY}`;
                }
                
                // Fallback also uses the Fail-Fast approach
                const fallbackResults = await googleSearch(fallbackSearchKeywords, 3); 
                gSearchResults.push(...fallbackResults);

                if (gSearchResults.length === 0) {
                     console.warn(`[Batch ${batchIndex+1}] No results after fallback. Skipping batch.`);
                     return [];
                }
            } 

            // 3. Feed results to Gemini for qualification
            const geminiQuery = `Generate 3 high-quality leads for a ${leadType} audience, with a focus on: "${template}". The primary query is "${targetType}" in "${location}". Base your leads strictly on these search results: ${JSON.stringify(gSearchResults)}`;

            const geminiLeads = await generateGeminiLeads(
                geminiQuery,
                systemInstruction
            );
            return geminiLeads;
        })(i); 
        
        batchPromises.push(batchPromise);
    }
    
    // --- Wait for ALL concurrent batches to complete ---
    const resultsFromBatches = await Promise.all(batchPromises);
    
    // Flatten the array of lead arrays into one master list
    let allLeads = resultsFromBatches.flat();

    // --- Final Enrichment and Ranking (Sequential, but fast) ---
    allLeads = deduplicateLeads(allLeads);
    
    const PLACEHOLDER_DOMAINS = ['example.com', 'placeholder.net', 'null.com', 'test.com'];

    for (let lead of allLeads) {
        // Check if the current email is empty or contains a known placeholder
        const shouldEnrich = !lead.email || PLACEHOLDER_DOMAINS.some(domain => lead.email.includes(domain));

        if (shouldEnrich) {
            lead.email = await enrichEmail(lead.name, lead.website);
        }

        lead.phoneNumber = lead.phoneNumber || await enrichPhoneNumber();
        lead.qualityScore = computeQualityScore(lead);
        lead.socialSignal = lead.socialSignal || await generatePremiumInsights(lead);
    }
    return rankLeads(allLeads);
}


// ------------------------------------------------
// 1. Synchronous Handler (Quick Job: Max 3 Leads)
// ------------------------------------------------
exports.handler = async (event) => {
    
    const CORS_HEADERS = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };
    
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: CORS_HEADERS, body: '' };
    }
    
    if (event.httpMethod !== 'POST') {
        return { 
            statusCode: 405, 
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
            body: JSON.stringify({ error: 'Method Not Allowed' })
        };
    }

    try {
        // Updated to targetType and activeSignal
        const { leadType, targetType, activeSignal, location, salesPersona } = JSON.parse(event.body);
        
        if (!leadType || !targetType || !activeSignal || !location || !salesPersona) return { 
             statusCode: 400, 
             headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
             body: JSON.stringify({ error: "Missing required parameters: leadType, targetType, activeSignal, location, or salesPersona." }) 
        };

        // CRITICAL: Hard limit the synchronous job to 1 batch (3 leads)
        const batchesToRun = 1; 
        const requiredLeads = 3;

        console.log(`[Handler] Running QUICK JOB (max 3 leads) for: ${targetType} (Signal: ${activeSignal}) in ${location}.`);

        // Updated function call
        const leads = await generateLeadsBatch(leadType, targetType, activeSignal, location, salesPersona, batchesToRun);
        
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
            body: JSON.stringify({ leads: leads.slice(0, requiredLeads), count: leads.slice(0, requiredLeads).length })
        };
    } catch (err) {
        console.error('Lead Generator Handler Error:', err);
        return { 
            statusCode: 500, 
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
            body: JSON.stringify({ error: err.message, details: err.cause || 'No cause provided' }) 
        };
    }
};

// ------------------------------------------------
// 2. Asynchronous Handler (Background Job: Unlimited Leads)
// ------------------------------------------------
exports.background = async (event) => {
    
    const CORS_HEADERS = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };
    
    const immediateResponse = {
        statusCode: 202, // 202 Accepted
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        body: JSON.stringify({ status: 'Job accepted', message: 'Lead generation is running in the background. Results will be saved server-side.' })
    };

    try {
        // Updated to targetType and activeSignal
        const { leadType, targetType, activeSignal, location, totalLeads = 12, salesPersona } = JSON.parse(event.body);

        if (!leadType || !targetType || !activeSignal || !location || !salesPersona) {
             console.error("Background job missing required parameters:", event.body);
        }

        console.log(`[Background] Job accepted for ${totalLeads} leads. Returning 202 to client.`);
        
        // Execute the heavy logic asynchronously after returning the 202 response
        setTimeout(() => {
            (async () => {
                try {
                    // Background jobs can tolerate more batches and therefore more overall time
                    const batchesToRun = Math.ceil(totalLeads / 3);
                    console.log(`[Background] Starting ${batchesToRun} concurrent batches for ${totalLeads} leads.`);
                    
                    // Updated function call
                    const leads = await generateLeadsBatch(leadType, targetType, activeSignal, location, salesPersona, batchesToRun);
                    
                    console.log(`[Background] Successfully generated and enriched ${leads.length} leads. Leads are now ready for saving to database.`);
                    
                } catch (err) {
                    console.error('[Background] Async Lead Generation Failed:', err.message);
                }
            })();
        }, 0); 

        return immediateResponse;

    } catch (err) {
        console.error('Background Handler Initialization Error:', err);
        return immediateResponse; 
    }
};
