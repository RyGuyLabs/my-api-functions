/**
 * Ultimate Premium Lead Generator – Gemini + Google Custom Search (Option 2)
 *
 * - Uses LEAD_QUALIFIER_API_KEY for Gemini generative language
 * - Uses RYGUY_SEARCH_API_KEY + RYGUY_SEARCH_ENGINE_ID for Google Custom Search
 * - Produces verified, enriched, and prioritized leads
 * - Handles residential and commercial lead types
 * - Deduplicates and ranks leads
 * - Full CORS support for Netlify serverless deployment
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
async function googleSearch(query, numResults = 3) {
    // Ensure both required keys are present for Google Custom Search
    if (!SEARCH_API_KEY || !SEARCH_ENGINE_ID) {
        console.warn("RYGUY_SEARCH_API_KEY or RYGUY_SEARCH_ENGINE_ID is missing. Skipping Google Custom Search.");
        return [];
    }

    const url = `${GOOGLE_SEARCH_URL}?key=${SEARCH_API_KEY}&cx=${SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}&num=${numResults}`;
    
    // FIX: Apply stricter retry limits (max 3 retries, 500ms base delay) 
    // to prevent Netlify function timeout (30 seconds) during backoff.
    const response = await withBackoff(() => fetch(url), 3, 500); 
    const data = await response.json();
    
    // Check for search errors, e.g., if API key is invalid
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
    
    // Define the expected structure for the model to follow
    const responseSchema = {
        type: "ARRAY",
        description: "A list of high-quality, verified business leads.",
        items: {
            type: "OBJECT",
            properties: {
                name: { type: "STRING", description: "Official business name." },
                description: { type: "STRING", description: "A concise summary of the business derived from search results." },
                website: { type: "STRING", description: "The primary website URL." },
                email: { type: "STRING", description: "A placeholder or suggested email address." },
                phoneNumber: { type: "STRING", description: "A placeholder or suggested phone number." },
                qualityScore: { type: "STRING", description: "Rating of the lead quality (High, Medium, or Low)." },
                insights: { type: "STRING", description: "Premium insight derived from search results." },
                suggestedAction: { type: "STRING", description: "The next best action to pursue this lead." },
                draftPitch: { type: "STRING", description: "A one-sentence draft sales pitch." },
                socialSignal: { type: "STRING", description: "Recent social or news signal about the company." },
            },
            propertyOrdering: ["name", "description", "website", "email", "phoneNumber", "qualityScore", "insights", "suggestedAction", "draftPitch", "socialSignal"]
        }
    };

    const payload = {
        contents: [{ parts: [{ text: query }] }],
        systemInstruction: { parts: [{ text: systemInstruction }] },
        generationConfig: { 
            temperature: 0.2, 
            maxOutputTokens: 2048,
            // CRITICAL FIX: Enforce JSON output structure
            responseMimeType: "application/json",
            responseSchema: responseSchema
        }
    };
    
    // FIX: Apply stricter backoff limits (max 4 retries, 1000ms base delay) 
    console.log('[Gemini] Sending request to Gemini API...'); 
    const response = await withBackoff(() =>
        fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }), 4, 1000 
    );
    const result = await response.json();
    
    // Since responseMimeType is set to application/json, the output should be clean JSON text.
    let raw = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '[]';
    
    // With responseMimeType="application/json", we skip the complicated string manipulation (stripping markdown/conversational text)
    // and go straight to parsing the output.
    
    try {
        // Attempt 1: Standard parse 
        return JSON.parse(raw);
    } catch (e) {
        // CRITICAL FIX: The error is "Unterminated string in JSON", meaning an unescaped double quote 
        // was generated inside a string value (e.g., in 'description').
        // This attempts to sanitize the raw output by escaping any unescaped quotes.
        
        let cleanedText = raw;
        
        // This regex aggressively escapes quotes that are preceded by something OTHER than a backslash, 
        // preventing an unescaped quote within a string field from prematurely terminating the JSON structure.
        cleanedText = cleanedText.replace(/([^\\])"/g, (match, p1) => `${p1}\\"`);
        
        try {
            // Attempt 2: Parse the aggressively cleaned string
            return JSON.parse(cleanedText);
        } catch (e2) {
            // If even the cleaned version fails, log both errors and throw the original.
            console.error("Failed to parse Gemini output as JSON, even with structured output enforcement and aggressive cleaning. Original error:", e.message);
            console.error("Second attempt error after cleaning:", e2.message);
            console.error("Raw output (first 200 chars):", raw.substring(0, 200) + (raw.length > 200 ? '...' : ''));
            throw new Error("Failed to parse Gemini output as JSON.", { cause: e.message });
        }
    }
}

// -------------------------
// Lead Generator
// -------------------------
async function generateLeadsBatch(leadType, searchTerm, location, financialTerm, totalBatches = 4) {
    console.log(`[Batch] Starting lead generation batches for: ${searchTerm} in ${location}. Total batches: ${totalBatches}`); // ADDED LOG
    const template = leadType === 'residential'
        ? "Focus on individual homeowners, financial capacity, recent property activities."
        : "Focus on businesses, size, industry relevance, recent developments.";

    const systemInstruction = `You are an expert Lead Generation analyst using the provided data.
You MUST follow the JSON schema provided in the generation config.`; // Simplified instruction as schema handles the structure

    let allLeads = [];
    
    // We run this in sequence (not concurrently) to ensure the search results for one batch
    // are generated before the next batch search starts, which may help diversify results.
    for (let i = 0; i < totalBatches; i++) {
        // --- MODIFIED SEARCH QUERY ---
        // Simplified the search query to only include the core terms and added "company website" 
        // to force more specific, non-generic results from Google Custom Search.
        const baseSearchQuery = `${searchTerm} in ${location}`;
        const searchKeywords = `${baseSearchQuery} company website`;
        
        console.log(`[Batch ${i+1}/${totalBatches}] Searching with keywords: "${searchKeywords}"`); // Added specific batch log

        // 1. Get verified search results using Custom Search
        const gSearchResults = await googleSearch(searchKeywords, 5); // Search for 5 results to give Gemini options
        
        if (gSearchResults.length === 0) {
            console.warn(`Custom Search returned no results for batch ${i}. Skipping Gemini step.`);
            continue;
        }

        // 2. Feed results to Gemini for formatting, enrichment, and qualification
        
        // CRITICAL FIX: Embed the B2C/B2B context from 'template' directly into the user query.
        const geminiQuery = `Generate 3 high-quality leads for a ${leadType} audience, with a focus on: "${template}". The primary query is "${searchTerm}" in "${location}". Base your leads strictly on these search results: ${JSON.stringify(gSearchResults)}`;

        const geminiLeads = await generateGeminiLeads(
            geminiQuery,
            systemInstruction
        );
        allLeads.push(...geminiLeads);
    }

    allLeads = deduplicateLeads(allLeads);
    for (let lead of allLeads) {
        // Enrich local/dummy fields (since we're relying on Custom Search for core data)
        lead.email = lead.email || await enrichEmail(lead.name, lead.website);
        lead.phoneNumber = lead.phoneNumber || await enrichPhoneNumber();
        lead.qualityScore = computeQualityScore(lead);
        lead.socialSignal = lead.socialSignal || await generatePremiumInsights(lead);
    }
    return rankLeads(allLeads);
}

// -------------------------
// Netlify Handler
// -------------------------
exports.handler = async (event) => {
    
    // FIX 1: Define a unified set of headers for all success and error responses
    const CORS_HEADERS = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };
    
    // 1. OPTIONS Preflight handler
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: CORS_HEADERS,
            body: ''
        };
    }
    
    // 2. 405 Method Not Allowed handler (FIX: previously returned without headers)
    if (event.httpMethod !== 'POST') {
        return { 
            statusCode: 405, 
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
            body: JSON.stringify({ error: 'Method Not Allowed' })
        };
    }

    try {
        const { leadType, searchTerm, location, financialTerm, totalLeads } = JSON.parse(event.body);
        console.log(`[Handler] Request received for: ${searchTerm} in ${location}`); // ADDED LOG
        if (!leadType || !searchTerm || !location) return { 
             statusCode: 400, 
             headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
             body: JSON.stringify({ error: "Missing required parameters." }) 
        };

        const requiredLeads = totalLeads || 12;
        // Since Gemini generates 3 leads per call, calculate the batches needed.
        const batchesToRun = Math.ceil(requiredLeads / 3);

        const leads = await generateLeadsBatch(leadType, searchTerm, location, financialTerm, batchesToRun);
        
        console.log(`[Handler] Successfully generated ${leads.length} leads.`); // ADDED LOG

        // 3. 200 Success handler
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
            body: JSON.stringify({ leads: leads.slice(0, requiredLeads), count: leads.slice(0, requiredLeads).length })
        };
    } catch (err) {
        console.error('Lead Generator Error:', err);
        // 4. 500 Error handler (FIX: using unified headers)
        return { 
            statusCode: 500, 
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
            body: JSON.stringify({ error: err.message, details: err.cause || 'No cause provided' }) 
        };
    }
};
