/**
 * Netlify Lead Generation Function Mockup
 *
 * This file models the expected behavior of your serverless function
 * to ensure seamless integration with the complex payload sent by the frontend's
 * generateQuery() function (index.html).
 *
 * It is structured to:
 * 1. Parse the complex filters (industry, size, keyword, prompt, schema).
 * 2. Return structured JSON data matching the B2B_SCHEMA or B2C_SCHEMA.
 * 3. Use an internal mock to simulate the latency of the real AI/Search process.
 *
 * NOTE: Replace the mock function 'mockGeminiGenerate' with your actual
 * implementation using fetch to the Gemini API.
 */

const nodeFetch = require('node-fetch'); 
const fetch = nodeFetch.default || nodeFetch; 
const MOCK_LATENCY_MS = 3500; // Simulates a real 3.5s execution time (well under 10s limit)

// You must set these environment variables in your Netlify settings
const GEMINI_API_KEY = process.env.LEAD_QUALIFIER_API_KEY; 
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

// --- MOCK DATA GENERATOR ---

/**
 * Generates structured mock data based on the requested mode and schema.
 * In a real scenario, this is where you would call the Gemini API.
 */
async function mockGeminiGenerate(mode, filters, prompt) {
    // Simulate complex processing time
    await new Promise(resolve => setTimeout(resolve, MOCK_LATENCY_MS)); 

    if (mode === 'b2b') {
        const industry = filters.industry || 'Tech';
        const keyword = filters.keyword || 'Innovation';
        const location = filters.location || 'Global';
        
        return [
            {
                companyName: `${industry} Solutions Corp`,
                domain: `solutions-${industry.toLowerCase()}.com`,
                leadScore: 95,
                signalSummary: `Found explicit intent signal regarding '${keyword}' posted 5 days ago in a key industry forum.`,
                signalSource: 'https://example.com/b2b/signal1',
                recencyDays: 5,
                contact: { name: 'Sarah Connor', title: 'CTO', email: 'sc@solutions.com' }
            },
            {
                companyName: `Future-Ready Labs (${location})`,
                domain: `f-labs.io`,
                leadScore: 88,
                signalSummary: `Recently posted a job opening for a 'Head of Compliance' indicating a regulatory pain point.`,
                signalSource: 'https://example.com/b2b/jobpost',
                recencyDays: 14,
                contact: { name: 'John Doe', title: 'VP of Engineering', email: 'jd@flabs.io' }
            },
            {
                companyName: `Competitor X Migrator`,
                domain: `migrator.co`,
                leadScore: 92,
                signalSummary: `News article detailing their migration off of competitor X's platform in favor of a newer solution.`,
                signalSource: 'https://example.com/b2b/news',
                recencyDays: 1,
                contact: { name: 'Jane Smith', title: 'Director of IT', email: 'js@migrator.co' }
            }
        ];
    } else { // B2C Mode
        const demographic = filters.demographic || 'Homeowner';
        const keyword = filters.keyword || 'Renovation';

        return [
            {
                userNameOrHandle: `NeedHelpNow123`,
                platform: 'Reddit (r/DIY)',
                leadScore: 98,
                explicitNeed: `Quote: "My old furnace just died and I need advice on the best, most efficient replacement options *immediately*."`,
                signalSource: 'https://example.com/b2c/need1',
                recencyHours: 3,
                consumerSegment: demographic
            },
            {
                userNameOrHandle: `NewParent2025`,
                platform: 'Quora',
                leadScore: 91,
                explicitNeed: `Question: "We just brought our first baby home and are looking for advice on reliable life insurance plans."`,
                signalSource: 'https://example.com/b2c/need2',
                recencyHours: 24,
                consumerSegment: demographic
            }
        ];
    }
}

// --- SYNCHRONOUS HANDLER (FAST & FIXED) ---

/**
 * Netlify Function Handler: This is the entry point called by your frontend.
 * It is guaranteed to run fast (well under 10 seconds) to prevent the ERR_CONNECTION_RESET error.
 */
exports.handler = async (event) => {
    // Handle CORS preflight request
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: CORS_HEADERS, body: 'OK' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers: CORS_HEADERS, body: 'Method Not Allowed' };
    }

    try {
        const { mode, userPrompt, responseSchema, systemInstruction, filters } = JSON.parse(event.body);

        if (!mode || !filters || !userPrompt) {
            console.error('[Handler] Missing critical fields in request body.');
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
                body: JSON.stringify({ error: 'Missing mode, filters, or userPrompt in request.' })
            };
        }

        console.log(`[Handler] Starting FAST JOB for mode: ${mode} with filters:`, filters);

        // 1. Execute the mock generation (Simulates AI/Search API calls)
        // In your real code, you would use userPrompt, responseSchema, and systemInstruction
        // to construct the payload for your Gemini API call here.
        const leads = await mockGeminiGenerate(mode, filters, userPrompt);
        
        console.log(`[Handler] Fast job finished successfully. Generated ${leads.length} leads.`);

        // 2. Return the structured JSON array directly as expected by the frontend
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
            body: JSON.stringify(leads) // Return the array of leads directly
        };
        
    } catch (err) {
        console.error('Lead Generator Handler Error:', err);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
            body: JSON.stringify({ error: 'Internal server error during lead generation.', details: err.message })
        };
    }
};
