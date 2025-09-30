/**
 * Ultimate Premium Lead Generator – Gemini + Google Custom Search (Background Function)
 * * NOTE: This function is intended to be deployed as a Netlify Background Function,
 * allowing up to 15 minutes of execution time to prevent 504 Gateway Timeouts
 * caused by long-running LLM and search calls.
 * * - Execution is fire-and-forget; results are logged and would typically be saved
 * to a database (e.g., Firestore) in a production environment.
 */

const nodeFetch = require('node-fetch'); 
const fetch = nodeFetch.default || nodeFetch; // Defensive import to handle various node-fetch exports
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
            
            // Retryable errors (e.g., 500, 503, 429)
            console.warn(`Attempt ${attempt} failed with status ${response.status}. Retrying in ${Math.round(delay)}ms...`);
            await new Promise(r => setTimeout(r, delay));
            
        } catch (err) {
            if (attempt === maxRetries) throw err;
            const delay = Math.random() * baseDelay * Math.pow(2, attempt - 1);
            
            // Network errors are also retryable
            console.warn(`Attempt ${attempt} failed with network error. Retrying in ${Math.round(delay)}ms...`, err.message);
            await new Promise(r => setTimeout(r, delay));
        }
    }
    throw new Error("Max retries reached. Request failed permanently.");
};

// -------------------------
// Enrichment & Quality (Mock Data)
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
async function googleSearch(query, numResults = 5) {
    if (!SEARCH_API_KEY || !SEARCH_ENGINE_ID) {
        console.warn("RYGUY_SEARCH_API_KEY or RYGUY_SEARCH_ENGINE_ID is missing. Skipping Google Custom Search.");
        return [];
    }

    const url = `${GOOGLE_SEARCH_URL}?key=${SEARCH_API_KEY}&cx=${SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}&num=${numResults}`;
    
    // Using default backoff. Netlify's 15-minute timeout is now safe.
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
        description: "A list of high-quality, verified business leads.",
        items: {
            type: "OBJECT",
            properties: {
                name: { type: "STRING", description: "Official business name/individual name." },
                description: { type: "STRING", description: "A concise summary of the business/individual derived from search results." },
                website: { type: "STRING", description: "The primary website/social profile URL." },
                email: { type: "STRING", description: "A placeholder or suggested email address." },
                phoneNumber: { type: "STRING", description: "A placeholder or suggested phone number." },
                qualityScore: { type: "STRING", description: "Rating of the lead quality (High, Medium, or Low)." },
                insights: { type: "STRING", description: "Premium insight derived from search results." },
                suggestedAction: { type: "STRING", description: "The next best action to pursue this lead." },
                draftPitch: { type: "STRING", description: "A one-sentence draft sales pitch." },
                socialSignal: { type: "STRING", description: "Recent social or news signal about the company/individual." },
            },
            propertyOrdering: ["name", "description", "website", "email", "phoneNumber", "qualityScore", "insights", "suggestedAction", "draftPitch", "socialSignal"]
        }
    };

    const payload = {
        contents: [{ parts: [{ text: query }] }],
        systemInstruction: { parts: [{ text: systemInstruction }] },
        generationConfig: { 
            temperature: 0.2, 
            // Keeping this at 1024 for a good balance of speed and output size.
            maxOutputTokens: 1024,
            responseMimeType: "application/json",
            responseSchema: responseSchema
        }
    };
    
    console.log('[Gemini] Sending request to Gemini API...'); 
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
            console.error("Failed to parse Gemini output as JSON.", e2.message);
            throw new Error("Failed to parse Gemini output as JSON.", { cause: e.message });
        }
    }
}

// -------------------------
// B2C Targeted Keyword Definitions (Persona-Based)
// -------------------------
const PERSONA_KEYWORDS = {
    // Real Estate Agent: Targets high-intent movers and property owners.
    "real_estate": [
        `"home buyer" OR "recently purchased home"`,
        `"new construction" OR "single-family home"`,
        `"building permit" OR "home renovation project estimate"`,
        `"pre-foreclosure" OR "distressed property listing"`,
        `"recent move" OR "relocation" OR "new job in area"`
    ],
    // Life Insurance Agent: Targets age/wealth-based life events.
    "life_insurance": [
        `"high net worth" OR "affluent"`,
        `"financial planning seminar" OR "estate planning attorney"`,
        `"trust fund establishment" OR "recent inheritance"`,
        `"IRA rollover" OR "annuity comparison"`,
        `"age 50+" OR "retirement specialist"`
    ],
    // Financial Advisor / Wealth Management: Targets investors and business owners.
    "financial_advisor": [
        `"business owner" OR "recent funding"`,
        `"property investor" OR "real estate portfolio management"`,
        `"401k rollover" OR "retirement planning specialist"`,
        `"S-Corp filing" OR "new business incorporation"`
    ],
    // Local Services / Contractors: Targets residents planning home projects.
    "local_services": [
        `"home improvement" OR "major repair needed"`,
        `"renovation quote" OR "remodeling project bid"`,
        `"new construction start date" OR "large landscaping project"`,
        `"local homeowner review" OR "service provider recommendations"`
    ],
    // Mortgage / Loan Officer: Targets prospective buyers and refinance candidates.
    "mortgage": [
        `"mortgage application pre-approved" OR "refinancing quote"`,
        `"recent purchase contract signed" OR "new home loan needed"`,
        `"first-time home buyer seminar" OR "closing date soon"`,
        `"VA loan eligibility" OR "FHA loan requirements"`
    ],
    // Default fallback for any unlisted B2C type.
    "default": [
        `"event venue booking"`,
        `"moving company quotes"`,
        `"recent college graduate"`,
        `"small business startup help"`
    ]
};

// -------------------------
// B2B Targeted Keyword Definitions (Growth Signals)
// -------------------------
const COMMERCIAL_ENHANCERS = [
    `"new funding" OR "business expansion"`,
    `"recent hiring" OR "job posting"`,
    `"moved office" OR "new commercial building"`,
    `"new product launch" OR "major contract win"`
];

// -------------------------
// Lead Generator
// -------------------------
async function generateLeadsBatch(leadType, searchTerm, location, financialTerm, salesPersona, totalBatches = 4) {
    console.log(`[Batch] Starting lead generation batches for: ${searchTerm} in ${location}. Persona: ${salesPersona}. Total batches: ${totalBatches}`);
    const template = leadType === 'residential'
        ? "Focus on individual homeowners, financial capacity, recent property activities."
        : "Focus on businesses, size, industry relevance, recent developments.";

    const systemInstruction = `You are an expert Lead Generation analyst using the provided data.
You MUST follow the JSON schema provided in the generation config.`;

    let allLeads = [];
    const personaKeywords = PERSONA_KEYWORDS[salesPersona] || PERSONA_KEYWORDS['default'];
    
    for (let i = 0; i < totalBatches; i++) {
        
        let searchKeywords;
        let isResidential = leadType === 'residential';
        
        // --- PRIMARY QUERY CONSTRUCTION ---
        if (isResidential) {
            const enhancer = personaKeywords[i % personaKeywords.length]; 
            searchKeywords = `${searchTerm} in ${location} AND (${enhancer})`;
        } else {
            const b2bEnhancer = COMMERCIAL_ENHANCERS[i % COMMERCIAL_ENHANCERS.length];
            searchKeywords = `${searchTerm} in ${location} AND (${b2bEnhancer})`;
        }
        
        console.log(`[Batch ${i+1}/${totalBatches}] Searching (Primary) with keywords: "${searchKeywords}"`);

        // Get 5 results for better context now that the timeout is solved
        let gSearchResults = await googleSearch(searchKeywords, 5); 
        
        if (gSearchResults.length > 0) {
            console.log(`[Batch ${i+1}/${totalBatches}] Primary search returned ${gSearchResults.length} results.`);
        }
        
        // --- FALLBACK SEARCH MECHANISM ---
        if (gSearchResults.length === 0) {
            console.warn(`[Batch ${i+1}/${totalBatches}] No results for primary query: "${searchKeywords}". Trying simplified fallback...`);

            let fallbackSearchKeywords;
            if (isResidential) {
                const fallbackQuery = personaKeywords[0]; 
                fallbackSearchKeywords = `${fallbackQuery} in ${location}`;
            } else {
                 fallbackSearchKeywords = `${searchTerm} in ${location}`;
            }
            
            console.log(`[Batch ${i+1}/${totalBatches}] Fallback query: "${fallbackSearchKeywords}"`);
            
            // Get 5 results for fallback search
            const fallbackResults = await googleSearch(fallbackSearchKeywords, 5); 
            gSearchResults.push(...fallbackResults);

            if (gSearchResults.length === 0) {
                 console.warn(`[Batch ${i+1}/${totalBatches}] Fallback search also returned no results. Skipping Gemini step.`);
                 continue;
            } else {
                 console.log(`[Batch ${i+1}/${totalBatches}] Fallback successful, found ${fallbackResults.length} results.`);
            }
        } 
        
        // 2. Feed results to Gemini for formatting, enrichment, and qualification
        const geminiQuery = `Generate 3 high-quality leads for a ${leadType} audience, with a focus on: "${template}". The primary query is "${searchTerm}" in "${location}". Base your leads strictly on these search results: ${JSON.stringify(gSearchResults)}`;

        const geminiLeads = await generateGeminiLeads(
            geminiQuery,
            systemInstruction
        );
        allLeads.push(...geminiLeads);
    }

    allLeads = deduplicateLeads(allLeads);
    for (let lead of allLeads) {
        lead.email = lead.email || await enrichEmail(lead.name, lead.website);
        lead.phoneNumber = lead.phoneNumber || await enrichPhoneNumber();
        lead.qualityScore = computeQualityScore(lead);
        lead.socialSignal = lead.socialSignal || await generatePremiumInsights(lead);
    }
    return rankLeads(allLeads);
}

// ------------------------------------------
// Netlify Background Function Export
// ------------------------------------------
exports.background = async function(event, context) {
    
    console.log('[Handler] Background function execution started. Max time: 15 minutes.');
    
    try {
        const { leadType, searchTerm, location, financialTerm, totalLeads, salesPersona } = JSON.parse(event.body);
        console.log(`[Handler] Request received for: ${searchTerm} in ${location}. Persona: ${salesPersona}`);
        
        if (!leadType || !searchTerm || !location || !salesPersona) {
             console.error("Missing required parameters in background job. Aborting.");
             return { statusCode: 400 };
        }

        const requiredLeads = totalLeads || 12;
        const batchesToRun = Math.ceil(requiredLeads / 3);

        const leads = await generateLeadsBatch(leadType, searchTerm, location, financialTerm, salesPersona, batchesToRun);
        
        console.log(`[Handler] Successfully generated ${leads.length} leads in background.`);
        
        // CRITICAL STEP: In a real environment, leads would be saved to a database 
        // (e.g., Firestore, MongoDB) here for the client to retrieve later.
        console.log("--- GENERATED LEADS (Background Job Complete) ---");
        console.log(JSON.stringify(leads.slice(0, requiredLeads), null, 2));
        console.log("-------------------------------------------------");

        return {
            statusCode: 200, 
            body: JSON.stringify({ message: `Successfully generated ${leads.length} leads in the background.` })
        };
    } catch (err) {
        console.error('Lead Generator Background Error:', err);
        return { 
            statusCode: 500, 
            body: JSON.stringify({ error: err.message || 'Unknown internal error in background job.' }) 
        };
    }
};
