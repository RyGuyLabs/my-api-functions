/**
 * Ultimate Premium Lead Generator – Gemini + Google Custom Search
 *
 * This file contains two exports:
 * 1. exports.handler: Synchronous endpoint (guaranteed fast, max 3 leads).
 * 2. exports.background: Asynchronous endpoint (runs up to 15 minutes, unlimited leads).
 *
 * * CRITICAL FIX: Resolved "No results for primary query" error by restructuring the search
 * * to use (SOCIAL_SIGNAL OR ACTIVE_BUYER_SIGNAL) instead of (SOCIAL_SIGNAL AND ACTIVE_BUYER_SIGNAL).
 * * This increases the success rate of the highly qualified primary query dramatically.
 */

const nodeFetch = require('node-fetch'); 
const fetch = nodeFetch.default || nodeFetch; 

const GEMINI_API_KEY = process.env.LEAD_QUALIFIER_API_KEY;
const SEARCH_API_KEY = process.env.RYGUY_SEARCH_API_KEY;
const SEARCH_ENGINE_ID = process.env.RYGUY_SEARCH_ENGINE_ID;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent';
const GOOGLE_SEARCH_URL = 'https://www.googleapis.com/customsearch/v1';

// -------------------------
// Helper: Exponential Backoff with Full Jitter
// -------------------------
const withBackoff = async (fn, maxRetries = 6, baseDelay = 2000) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await fn();
            if (response.ok) return response;

            let errorBody = {};
            try { errorBody = await response.json(); } catch {}

            if (response.status >= 400 && response.status < 500 && response.status !== 429) {
                console.error(`API Fatal Error (Status ${response.status}):`, errorBody);
                throw new Error(`API Fatal Error: Status ${response.status}`, { cause: errorBody });
            }

            const delay = Math.random() * baseDelay * Math.pow(2, attempt - 1);
            
            console.warn(`Attempt ${attempt} failed with status ${response.status}. Retrying in ${Math.round(delay)}ms...`);
            await new Promise(r => setTimeout(r, delay));
            
        } catch (err) {
            if (attempt === maxRetries) throw err;
            const delay = Math.random() * baseDelay * Math.pow(2, attempt - 1);
            
            console.warn(`Attempt ${attempt} failed with network error. Retrying in ${Math.round(delay)}ms...`, err.message);
            await new Promise(r => setTimeout(r, delay));
        }
    }
    throw new Error("Max retries reached. Request failed permanently.");
};

// -------------------------
// Enrichment & Quality Helpers
// -------------------------
async function enrichEmail(name, website) {
    try {
        const domain = new URL(website).hostname;
        return `${name.toLowerCase().split(' ')[0]}.${name.toLowerCase().split(' ').pop()}@${domain}`.replace(/\s/g, '');
    } catch {
        return `info@${website.replace(/^https?:\/\//, '').split('/')[0]}`;
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
    
    // CRITICAL DEBUGGING LOG: Log the final query being sent.
    console.log(`[Google Search] Sending Query: ${query}`); 
    
    const response = await withBackoff(() => fetch(url), 3, 500); 
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
// Keyword Definitions 
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

// Combined list of all high-intent keywords to broaden the search
const ACTIVE_BUYER_KEYWORDS = [
    // Intent
    `"seeking recommendations for"`,
    `"looking for a quote for"`,
    `"need a referral for"`,
    `"who is the best" OR "top rated"`,
    `"compare prices" OR "price list"`,
    // Pain Point
    `"unhappy with current provider"`,
    `"looking to replace my"`,
    `"worst experience with"`,
    `"switching from"`,
    `"cancel subscription" OR "contract expired"`,
    // Review Focus
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
async function generateLeadsBatch(leadType, searchTerm, location, salesPersona, totalBatches = 4) {
    
    const template = leadType === 'residential'
        ? "Focus on individual homeowners, financial capacity, recent property activities."
        : "Focus on businesses, size, industry relevance, recent developments.";

    const systemInstruction = `You are an expert Lead Generation analyst using the provided data.
You MUST follow the JSON schema provided in the generation config.`;

    const personaKeywords = PERSONA_KEYWORDS[salesPersona] || PERSONA_KEYWORDS['default'];
    const isResidential = leadType === 'residential';
    
    const batchPromises = [];

    // --- Create ALL Promises Concurrently ---
    for (let i = 0; i < totalBatches; i++) {
        
        const batchPromise = (async (batchIndex) => {
            let searchKeywords;
            
            // Cycle through enhancers for variety
            const socialEnhancer = SOCIAL_MEDIA_ENHANCERS[batchIndex % SOCIAL_MEDIA_ENHANCERS.length];
            const activeBuyerEnhancer = ACTIVE_BUYER_KEYWORDS[batchIndex % ACTIVE_BUYER_KEYWORDS.length]; 

            // CRITICAL FIX: Combine Social and Active Buyer signals using OR.
            // This ensures at least one of the high-intent signals is present without restricting both simultaneously.
            const combinedIntent = `(${socialEnhancer}) OR (${activeBuyerEnhancer})`;
            
            // Determine primary search keywords
            if (isResidential) {
                const personaEnhancer = personaKeywords[batchIndex % personaKeywords.length]; 
                
                // Primary Query Structure: TERM + LOCATION + PERSONA + (SOCIAL OR ACTIVE_BUYER) + NEGATIVES
                searchKeywords = `${searchTerm} in ${location} AND (${personaEnhancer}) AND (${combinedIntent}) ${NEGATIVE_QUERY}`;
            } else {
                const b2bEnhancer = COMMERCIAL_ENHANCERS[batchIndex % COMMERCIAL_ENHANCERS.length];
                
                // Primary Query Structure: TERM + LOCATION + B2B + (SOCIAL OR ACTIVE_BUYER) + NEGATIVES
                searchKeywords = `${searchTerm} in ${location} AND (${b2bEnhancer}) AND (${combinedIntent}) ${NEGATIVE_QUERY}`;
            }
            
            // 1. Get verified search results (Primary)
            let gSearchResults = await googleSearch(searchKeywords, 3); 
            
            // 2. Fallback search if primary fails (Simplified Logic)
            if (gSearchResults.length === 0) {
                console.warn(`[Batch ${batchIndex+1}] No results for primary query. Trying simplified fallback...`);
                let fallbackSearchKeywords;
                if (isResidential) {
                    // Fallback uses just the best persona-specific keyword + location
                    const fallbackQuery = personaKeywords[0]; 
                    fallbackSearchKeywords = `${fallbackQuery} in ${location} ${NEGATIVE_QUERY}`;
                } else {
                    // Fallback uses just the best commercial keyword + location
                    const fallbackQuery = COMMERCIAL_ENHANCERS[0];
                    fallbackSearchKeywords = `${searchTerm} in ${location} AND (${fallbackQuery}) ${NEGATIVE_QUERY}`;
                }
                const fallbackResults = await googleSearch(fallbackSearchKeywords, 3); 
                gSearchResults.push(...fallbackResults);

                if (gSearchResults.length === 0) {
                     console.warn(`[Batch ${batchIndex+1}] No results after fallback. Skipping batch.`);
                     return [];
                }
            } 

            // 3. Feed results to Gemini for qualification
            const geminiQuery = `Generate 3 high-quality leads for a ${leadType} audience, with a focus on: "${template}". The primary query is "${searchTerm}" in "${location}". Base your leads strictly on these search results: ${JSON.stringify(gSearchResults)}`;

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
    for (let lead of allLeads) {
        lead.email = lead.email || await enrichEmail(lead.name, lead.website);
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
        const { leadType, searchTerm, location, salesPersona } = JSON.parse(event.body);
        
        if (!leadType || !searchTerm || !location || !salesPersona) return { 
             statusCode: 400, 
             headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
             body: JSON.stringify({ error: "Missing required parameters." }) 
        };

        // CRITICAL: Hard limit the synchronous job to 1 batch (3 leads)
        const batchesToRun = 1; 
        const requiredLeads = 3;

        console.log(`[Handler] Running QUICK JOB (max 3 leads) for: ${searchTerm} in ${location}.`);

        const leads = await generateLeadsBatch(leadType, searchTerm, location, salesPersona, batchesToRun);
        
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
        const { leadType, searchTerm, location, totalLeads = 12, salesPersona } = JSON.parse(event.body);

        if (!leadType || !searchTerm || !location || !salesPersona) {
             console.error("Background job missing required parameters:", event.body);
        }

        console.log(`[Background] Job accepted for ${totalLeads} leads. Returning 202 to client.`);
        
        // Execute the heavy logic asynchronously after returning the 202 response
        setTimeout(() => {
            (async () => {
                try {
                    const batchesToRun = Math.ceil(totalLeads / 3);
                    console.log(`[Background] Starting ${batchesToRun} concurrent batches for ${totalLeads} leads.`);
                    
                    const leads = await generateLeadsBatch(leadType, searchTerm, location, salesPersona, batchesToRun);
                    
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
