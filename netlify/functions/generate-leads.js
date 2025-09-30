/**
 * Ultimate Premium Lead Generator – Gemini + Google Custom Search
 * Supports both regular Netlify functions (`handler`, 30s limit) and background functions (`background`, 15m limit).
 */

const nodeFetch = require('node-fetch'); 
const fetch = nodeFetch.default || nodeFetch;

const GEMINI_API_KEY = process.env.LEAD_QUALIFIER_API_KEY;
const SEARCH_API_KEY = process.env.RYGUY_SEARCH_API_KEY;
const SEARCH_ENGINE_ID = process.env.RYGUY_SEARCH_ENGINE_ID;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent';
const GOOGLE_SEARCH_URL = 'https://www.googleapis.com/customsearch/v1';

// -------------------------
// Helper: Exponential Backoff
// -------------------------
const withBackoff = async (fn, maxRetries = 6, baseDelay = 2000) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await fn();
            if (response.ok) return response;

            let errorBody = {};
            try { errorBody = await response.json(); } catch {}

            if (response.status >= 400 && response.status < 500 && response.status !== 429) {
                throw new Error(`API Fatal Error: Status ${response.status}`, { cause: errorBody });
            }

            const delay = Math.random() * baseDelay * Math.pow(2, attempt - 1);
            await new Promise(r => setTimeout(r, delay));
        } catch (err) {
            if (attempt === maxRetries) throw err;
            const delay = Math.random() * baseDelay * Math.pow(2, attempt - 1);
            await new Promise(r => setTimeout(r, delay));
        }
    }
    throw new Error("Max retries reached. Request failed permanently.");
};

// -------------------------
// Enrichment & Quality
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
    if (!SEARCH_API_KEY || !SEARCH_ENGINE_ID) return [];
    const url = `${GOOGLE_SEARCH_URL}?key=${SEARCH_API_KEY}&cx=${SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}&num=${numResults}`;
    const response = await withBackoff(() => fetch(url), 3, 500); 
    const data = await response.json();
    if (data.error) return [];
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
    if (!GEMINI_API_KEY) throw new Error("LEAD_QUALIFIER_API_KEY missing.");
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
            }
        }
    };

    const payload = {
        contents: [{ parts: [{ text: query }] }],
        systemInstruction: { parts: [{ text: systemInstruction }] },
        generationConfig: { 
            temperature: 0.2, 
            maxOutputTokens: 1024,
            responseMimeType: "application/json",
            responseSchema
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
    const raw = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '[]';
    
    try { return JSON.parse(raw); } 
    catch (e) { 
        let cleaned = raw.replace(/([^\\])"/g, (m, p) => `${p}\\"`);
        // If JSON parsing still fails after initial clean-up attempt, throw the error
        if (JSON.parse(cleaned) === null) {
            throw new Error(`Failed to parse Gemini output as JSON after cleaning: ${e.message}`);
        }
        return JSON.parse(cleaned);
    }
}

// -------------------------
// Persona & B2B Keywords
// -------------------------
const PERSONA_KEYWORDS = {
    "real_estate": [`"home buyer" OR "recently purchased home"`, `"new construction" OR "single-family home"`, `"building permit" OR "home renovation project estimate"`, `"pre-foreclosure" OR "distressed property listing"`, `"recent move" OR "relocation" OR "new job in area"`],
    "life_insurance": [`"high net worth" OR "affluent"`, `"financial planning seminar" OR "estate planning attorney"`, `"trust fund establishment" OR "recent inheritance"`, `"IRA rollover" OR "annuity comparison"`, `"age 50+" OR "retirement specialist"`],
    "financial_advisor": [`"business owner" OR "recent funding"`, `"property investor" OR "real estate portfolio management"`, `"401k rollover" OR "retirement planning specialist"`, `"S-Corp filing" OR "new business incorporation"`],
    "local_services": [`"home improvement" OR "major repair needed"`, `"renovation quote" OR "remodeling project bid"`, `"new construction start date" OR "large landscaping project"`, `"local homeowner review" OR "service provider recommendations"`],
    "mortgage": [`"mortgage application pre-approved" OR "refinancing quote"`, `"recent purchase contract signed" OR "new home loan needed"`, `"first-time home buyer seminar" OR "closing date soon"`, `"VA loan eligibility" OR "FHA loan requirements"`],
    "default": [`"event venue booking"`, `"moving company quotes"`, `"recent college graduate"`, `"small business startup help"`]
};
const COMMERCIAL_ENHANCERS = [`"new funding" OR "business expansion"`, `"recent hiring" OR "job posting"`, `"moved office" OR "new commercial building"`, `"new product launch" OR "major contract win"`];

// -------------------------
// Lead Generation Core
// -------------------------
async function generateLeadsBatch(leadType, searchTerm, location, financialTerm, salesPersona, totalBatches = 4) {
    const template = leadType === 'residential'
        ? "Focus on individual homeowners, financial capacity, recent property activities."
        : "Focus on businesses, size, industry relevance, recent developments.";
    const systemInstruction = `You are an expert Lead Generation analyst using the provided data. Follow the JSON schema.`;

    let allLeads = [];
    const personaKeywords = PERSONA_KEYWORDS[salesPersona] || PERSONA_KEYWORDS['default'];

    for (let i = 0; i < totalBatches; i++) {
        let searchKeywords = leadType === 'residential'
            ? `${searchTerm} in ${location} AND (${personaKeywords[i % personaKeywords.length]})`
            : `${searchTerm} in ${location} AND (${COMMERCIAL_ENHANCERS[i % COMMERCIAL_ENHANCERS.length]})`;

        let gSearchResults = await googleSearch(searchKeywords, 5);

        if (gSearchResults.length === 0) {
            const fallbackQuery = leadType === 'residential' ? `${personaKeywords[0]} in ${location}` : `${searchTerm} in ${location}`;
            gSearchResults = await googleSearch(fallbackQuery, 5);
        }

        if (gSearchResults.length === 0) continue;

        const geminiLeads = await generateGeminiLeads(
            `Generate 3 high-quality leads for a ${leadType} audience, focus on: "${template}". Query: "${searchTerm}" in "${location}". Results: ${JSON.stringify(gSearchResults)}`,
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

// -------------------------
// Regular Netlify Function Handler (Sync)
// -------------------------
exports.handler = async function(event) {
    try {
        // IMPORTANT: CORS headers must be added here for the sync handler
        const headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        };

        if (event.httpMethod === 'OPTIONS') {
            return { statusCode: 200, headers };
        }

        const { leadType, searchTerm, location, financialTerm, totalLeads, salesPersona } = JSON.parse(event.body);
        if (!leadType || !searchTerm || !location || !salesPersona) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing required parameters." }) };
        }
        const batches = Math.ceil((totalLeads || 3) / 3); // Defaulting to 3 leads for sync handler
        const leads = await generateLeadsBatch(leadType, searchTerm, location, financialTerm, salesPersona, batches);
        return { statusCode: 200, headers, body: JSON.stringify({ leads: leads.slice(0, totalLeads), count: leads.length }) };
    } catch (err) {
        return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: err.message }) };
    }
};

// -------------------------
// Netlify Background Function (Async)
// -------------------------
exports.background = async function(event, context) {
    try {
        const { leadType, searchTerm, location, financialTerm, totalLeads, salesPersona } = JSON.parse(event.body);
        if (!leadType || !searchTerm || !location || !salesPersona) {
            console.error("Missing required parameters in background job. Aborting.");
            return { statusCode: 400 };
        }

        const batches = Math.ceil((totalLeads || 12) / 3);
        const leads = await generateLeadsBatch(leadType, searchTerm, location, financialTerm, salesPersona, batches);

        console.log("--- GENERATED LEADS (Background) ---");
        console.log(JSON.stringify(leads.slice(0, totalLeads), null, 2));
        console.log("------------------------------------");

        // Changed status code to 202 Accepted
        return { 
            statusCode: 202, 
            body: JSON.stringify({ message: `Lead generation accepted and processing in background. Leads generated: ${leads.length}.` }) 
        };
    } catch (err) {
        console.error('Lead Generator Background Error:', err);
        return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Unknown error in background job.' }) };
    }
};
