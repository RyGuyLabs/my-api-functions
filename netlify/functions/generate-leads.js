/**
 * Ultimate Premium Lead Generator (Simplified)
 *
 * This version removes Redis for maximum deployment simplicity.
 * - Batch processing with controlled concurrency to generate large lists faster.
 * - Deduplication to ensure unique leads.
 * - Dynamic priority ranking based on enriched data.
 * - Robust exponential backoff with FULL JITTER for high reliability against 503 errors.
 *
 * NOTE: This function only requires the 'node-fetch' package.
 */

const apiFetch = require('node-fetch'); // Renamed from 'fetch' to avoid potential environment conflicts
// const Redis = require('ioredis'); <--- REMOVED

// ====================
// Gemini API Setup
// ====================
// Using LEAD_QUALIFIER_API_KEY for the Gemini model's authentication, as specified for generative language.
// RYGUY_SEARCH_API_KEY and RYGUY_SEARCH_ENGINE_ID are not required here 
// because this function uses Gemini's native Google Search grounding feature.
const GEMINI_API_KEY = process.env.LEAD_QUALIFIER_API_KEY;
const API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODEL_NAME = 'gemini-2.5-flash-preview-05-20';

// ====================
// Dummy Enrichment & Insights
// ====================
async function enrichEmail(name, website) {
    try {
        const domain = new URL(website).hostname;
        // Simulate finding a likely corporate email format
        return `${name.toLowerCase().split(' ')[0]}.${name.toLowerCase().split(' ').pop()}@${domain}`.replace(/\s/g, '');
    } catch {
        // Fallback for invalid URLs
        return `info@${website.replace(/^https?:\/\//, '').split('/')[0]}`;
    }
}

async function enrichPhoneNumber() {
    // Simulates calling a phone number lookup service
    return `+1-555-${Math.floor(1000000 + Math.random() * 9000000)}`;
}

function computeQualityScore(lead) {
    if (lead.email && lead.phoneNumber && lead.email.includes('@')) return 'High';
    if (!lead.email && !lead.phoneNumber) return 'Low';
    return 'Medium';
}

async function generatePremiumInsights(lead) {
    // Simulates generating deep insights post-Gemini call (e.g., pulling from a dedicated news API)
    const recentEvents = [
        `Featured in local news about ${lead.name}`,
        `Announced new product/service in ${lead.website}`,
        `Recent funding or partnership signals for ${lead.name}`,
        `High engagement on social media for ${lead.name}`
    ];
    return recentEvents[Math.floor(Math.random() * recentEvents.length)];
}

// ====================
// Dynamic Priority Ranking
// ====================
function rankLeads(leads) {
    // Ranks leads for frontend sorting based on combined quality and recency signals
    return leads
        .map(lead => {
            let score = 0;
            if (lead.qualityScore === 'High') score += 3;
            if (lead.qualityScore === 'Medium') score += 2;
            if (lead.qualityScore === 'Low') score += 1;
            if (lead.socialSignal) score += 1; // Bonus for recent activity
            return { ...lead, priorityScore: score };
        })
        .sort((a, b) => b.priorityScore - a.priorityScore);
}

// ====================
// Exponential Backoff with Jitter
// ====================
const withBackoff = async (fn, maxRetries = 6, delay = 2000) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await fn();
            if (response.ok) return response;
            
            // Try to parse error body but don't fail if it's not JSON
            let errorBody = {};
            try {
                errorBody = await response.json();
            } catch (e) {
                // Ignore parsing errors for non-JSON responses
            }

            // Fatal, non-retryable errors
            if (response.status >= 400 && response.status < 500 && response.status !== 429) {
                console.error(`Gemini Fatal Error (Status ${response.status}):`, errorBody);
                throw new Error(`Gemini API Fatal Error: Status ${response.status}`, { cause: errorBody });
            }
            
            // Calculate randomized delay (Full Jitter)
            const maxDelay = delay * Math.pow(2, attempt - 1);
            const jitterDelay = Math.random() * maxDelay; // Random delay between 0 and maxDelay
            
            // Retryable errors (e.g., 500, 503, 429)
            console.warn(`Attempt ${attempt} failed with status ${response.status}. Retrying in ${Math.round(jitterDelay)}ms...`);
            await new Promise(resolve => setTimeout(resolve, jitterDelay));
            
        } catch (err) {
            // Network errors are also retryable
            if (attempt === maxRetries) throw err;
            
            // Calculate randomized delay (Full Jitter) for network errors too
            const maxDelay = delay * Math.pow(2, attempt - 1);
            const jitterDelay = Math.random() * maxDelay;
            
            console.warn(`Attempt ${attempt} failed with network error. Retrying in ${Math.round(jitterDelay)}ms...`, err.message);
            await new Promise(resolve => setTimeout(resolve, jitterDelay));
        }
    }
    throw new Error("Max retries reached. Request failed permanently.");
};

// ====================
// Smart Lead Type Template
// ====================
function getLeadTypeTemplate(leadType) {
    if (leadType === 'residential') {
        return "Focus on individual homeowners, their financial capacity, and recent property activities.";
    }
    if (leadType === 'commercial') {
        return "Focus on businesses, size, industry relevance, and recent business developments.";
    }
    return "General lead type, mix of residential and commercial insights.";
}

// ====================
// Generate Lead Batch with Concurrency
// ====================
async function generateLeadsBatch(leadType, searchTerm, location, financialTerm, batchCount) {
    const systemInstruction = `You are an expert Lead Generation analyst using Google Search for real-time data.
        Your response MUST be a single, valid JSON array containing exactly 3 objects.
        Do NOT include any surrounding text, comments, or markdown ticks (\`\`\`) in your final output.
        Include: name, description, website, email, phoneNumber, qualityScore, insights, suggestedAction, draftPitch, socialSignal.`;

    const template = getLeadTypeTemplate(leadType);

    const queue = Array.from({ length: batchCount }, (_, i) => i);
    const leads = [];
    const CONCURRENCY = 2; // Controlled concurrency

    const processQueue = async () => {
        while (queue.length > 0) {
            // Use queue.pop() to prevent multiple workers from pulling the same index simultaneously
            if (queue.pop() === undefined) break; 
            
            const userQuery = `Generate 3 high-quality ${leadType} leads for ${searchTerm} in ${location}.
${template}${leadType === 'residential' && financialTerm ? ` Financial filter: ${financialTerm}` : ''}`;

            const payload = {
                contents: [{ parts: [{ text: userQuery }] }],
                tools: [{ "google_search": {} }],
                systemInstruction: { parts: [{ text: systemInstruction }] },
                generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
            };

            try {
                const response = await withBackoff(() =>
                    apiFetch(`${API_BASE_URL}/${MODEL_NAME}:generateContent?key=${GEMINI_API_KEY}`, { // Updated to use apiFetch
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload),
                    })
                );

                const result = await response.json();
                let raw = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '[]';
                raw = raw.replace(/^```json\s*|^\s*```\s*|^\s*```\s*json\s*|\s*```\s*$/gmi, '').trim();

                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    leads.push(...parsed);
                }
            } catch (err) {
                console.warn('Failed to process a batch of leads, skipping batch.', err.message);
            }
        }
    };

    const workers = Array.from({ length: CONCURRENCY }, processQueue);
    await Promise.all(workers);
    
    return leads;
}

// ====================
// Deduplicate Leads
// ====================
function deduplicateLeads(leads) {
    const seen = new Set();
    return leads.filter(lead => {
        const key = `${lead.name}-${lead.website}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// ====================
// Serverless Handler
// ====================
exports.handler = async (event) => {
    // CORS Preflight
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            },
            body: '',
        };
    }

    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        const { leadType, searchTerm, location, financialTerm, totalLeads } = JSON.parse(event.body);
        if (!leadType || !searchTerm || !location) return { statusCode: 400, body: JSON.stringify({ error: "Missing required parameters." }) };

        const requestedTotalLeads = totalLeads || 12;

        // 1. GENERATE BATCHES (Directly, no cache check needed)
        const batchesNeeded = Math.ceil(requestedTotalLeads / 3);
        let rawLeads = await generateLeadsBatch(leadType, searchTerm, location, financialTerm, batchesNeeded);

        // 2. DEDUPLICATION & TRUNCATION
        rawLeads = deduplicateLeads(rawLeads).slice(0, requestedTotalLeads);

        // 3. ENRICHMENT & SCORING
        for (let lead of rawLeads) {
            lead.email = lead.email || await enrichEmail(lead.name, lead.website);
            lead.phoneNumber = lead.phoneNumber || await enrichPhoneNumber();
            
            lead.qualityScore = computeQualityScore(lead);
            lead.socialSignal = lead.socialSignal || await generatePremiumInsights(lead);
        }

        // 4. RANKING
        const rankedLeads = rankLeads(rawLeads);

        // 5. RETURN
        const responseBody = JSON.stringify({ leads: rankedLeads, count: rankedLeads.length });
        
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: responseBody,
        };

    } catch (error) {
        console.error('Ultimate Premium Lead Generator Error:', error);
        return { 
            statusCode: 500, 
            body: JSON.stringify({ error: error.message, details: error.cause || 'No cause provided' }) 
        };
    }
};
