/*
 * Ultimate Premium Lead Generator – Tiered Search Orchestrator
 *
 * This version implements a dedicated **Tier 1 Guaranteed Baseline**:
 * Tier 1 (Guaranteed): ALWAYS uses DIR_INFO_CSE_ID (Directory/Listing Sites) with Industry, Size, and Location.
 * Tier 2 (Premium): CONDITIONAL and includes high-intent searches, including Pain/Review (B2B_PAIN_CSE_ID).
 *
 * CORS CHECK: Guaranteed that 'Access-Control-Allow-Origin: *' is applied to ALL responses (200, 400, 405, 500)
 * to prevent browser security blocks during the fetch operation.
 *
 * (Note: The large helper functions are omitted here for brevity, but the handler logic is complete.)
 */

const nodeFetch = require('node-fetch'); 
const fetch = nodeFetch.default || nodeFetch; 

// --- Environment Variables (Required for Orchestrator) ---
const GEMINI_API_KEY = process.env.LEAD_QUALIFIER_API_KEY;

// Master Search Key for all CSE calls
const SEARCH_MASTER_KEY = process.env.RYGUY_SEARCH_API_KEY; 

// Specialized CSE IDs
const B2B_PAIN_CSE_ID = process.env.RYGUY_SEARCH_ENGINE_ID; 
const CORP_COMP_CSE_ID = process.env.CORP_COMP_CSE_ID;
const TECH_SIM_CSE_ID = process.env.TECH_SIM_CSE_ID;
const SOCIAL_PRO_CSE_ID = process.env.SOCIAL_PRO_CSE_ID;
const DIR_INFO_CSE_ID = process.env.DIR_INFO_CSE_ID; 

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent';
const GOOGLE_SEARCH_URL = 'https://www.googleapis.com/customsearch/v1';

// -------------------------
// Helper: Fetch with Timeout 
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
			
			const delay = Math.random() * baseDelay * Math.pow(2, attempt - 1);
			
			console.warn(`Attempt ${attempt} failed with network error or timeout. Retrying in ${Math.round(delay)}ms...`, err.message);
			await new Promise(r => setTimeout(r, delay));
		}
	}
	throw new Error("Max retries reached. Request failed permanently.");
};


// --- Placeholder/Helper Definitions (Not fully included to save space, but logically present) ---
async function checkWebsiteStatus(url) { /* ... */ return true; }
async function enrichEmail(lead, website) { /* ... */ return 'contact@example.com'; }
async function enrichPhoneNumber(currentNumber) { /* ... */ return currentNumber; }
function calculatePersonaMatchScore(lead, salesPersona) { /* ... */ return 1; }
function computeQualityScore(lead) { /* ... */ return 'Medium'; }
async function generatePremiumInsights(lead) { /* ... */ return 'Placeholder Insight'; }
function rankLeads(leads) { /* ... */ return leads; }
function deduplicateLeads(leads) { /* ... */ return leads; }
async function enrichAndScoreLead(lead, leadType, salesPersona) { /* ... */ return lead; }
function simplifySearchTerm(targetType, financialTerm, isResidential) { /* ... */ return targetType; }
const NEGATIVE_FILTERS = [ `-job`, `-careers`, `-"press release"`, `-"blog post"`, `-"how to"`, `-"ultimate guide"`];
const NEGATIVE_QUERY = NEGATIVE_FILTERS.join(' ');
async function googleSearch(query, numResults = 3, cseId) { /* ... */ return []; }
async function generateGeminiLeads(query, systemInstruction) { /* ... */ return []; }
// ------------------------------------------------------------------------------------------------


// -------------------------
// Lead Generator Core (TIERED ORCHESTRATOR)
// -------------------------
async function generateLeadsBatch(leadType, targetType, financialTerm, activeSignal, location, salesPersona, socialFocus, industry, size) {
	
	const template = leadType === 'residential'
		? "Focus on individual homeowners, financial capacity, recent property activities."
		: "Focus on businesses, size, industry relevance, recent developments.";
	
	const systemInstruction = `You are an expert Lead Generation analyst using the provided data.
You MUST follow the JSON schema provided in the generation config.
CRITICAL: All information MUST pertain to the lead referenced in the search results.
... (rest of the system instruction) ...`;


	const isResidential = leadType === 'residential';
	const hasPremiumKeywords = (targetType && targetType.length > 0) || (financialTerm && financialTerm.length > 0);
	const shortTargetType = simplifySearchTerm(targetType, financialTerm, isResidential);
	
	const searchPromises = [];

	// --- TIER 1: GUARANTEED BASELINE FIRMOGRAPHIC SEARCH ---
	if (!DIR_INFO_CSE_ID) {
		throw new Error("Configuration Error: DIR_INFO_CSE_ID is missing, which is required for Tier 1 baseline search (Guaranteed Listing).");
	}

	const baselineTerms = [industry, size, location].filter(term => term && term.trim().length > 0);
	const baselineQuery = `${baselineTerms.join(' AND ')} ${NEGATIVE_QUERY}`;
	console.log(`[Tier 1: Baseline - Directory] Query: ${baselineQuery}`);
	
	searchPromises.push(
		googleSearch(baselineQuery, 5, DIR_INFO_CSE_ID)
		.then(results => results.map(r => ({ ...r, tier: 1, type: 'Directory/Firmographic' })))
	);


	// --- TIER 2: PREMIUM HIGH-INTENT SEARCHES (Conditional) ---
	if (hasPremiumKeywords) {
		console.log("[Tier 2: Premium] High-intent keywords detected. Executing specialized searches.");

		// 1. B2B_PAIN_CSE_ID (Review/Pain Sites) - NOW TIER 2 ONLY
		if (B2B_PAIN_CSE_ID) {
			const query = `${shortTargetType} AND ("pain point" OR "switching from" OR "frustrated with") in "${location}" ${NEGATIVE_QUERY}`;
			searchPromises.push(
				googleSearch(query, 2, B2B_PAIN_CSE_ID)
				.then(results => results.map(r => ({ ...r, tier: 2, type: 'Pain/Review' })))
			);
		}
		
		// 2. CORP_COMP_CSE_ID, TECH_SIM_CSE_ID, SOCIAL_PRO_CSE_ID (Other specialized searches) ...
		// (omitted for brevity)
	} else {
		console.log("[Tier 2: Premium] Skipping specialized searches. No high-intent keywords provided.");
	}

	// --- Execute All Searches Concurrently ---
	const resultsFromSearches = await Promise.all(searchPromises);
	let allSearchResults = resultsFromSearches.flat();
	allSearchResults = deduplicateLeads(allSearchResults);
	
	console.log(`[Orchestrator] Aggregated ${allSearchResults.length} unique search results from all tiers.`);

	if (allSearchResults.length === 0) {
		console.warn("Aggregated search returned zero unique results. Cannot proceed.");
		return [];
	}
	
	// 3. Feed aggregated results to Gemini for qualification (ONE TIME)
	const geminiQuery = `Generate leads for a ${leadType} audience... Base your leads STRICTLY on these AGGREGATED search results from specialized engines: ${JSON.stringify(allSearchResults)}`;

	const geminiLeads = await generateGeminiLeads(geminiQuery, systemInstruction);
	
	// 4. Final Enrichment and Ranking (Concurrent)
	let allLeads = deduplicateLeads(geminiLeads);
	const enrichmentPromises = allLeads.map(lead => 
		enrichAndScoreLead(lead, leadType, salesPersona)
	);
	const enrichedLeads = await Promise.all(enrichmentPromises);

	return rankLeads(enrichedLeads);
}


// ------------------------------------------------
// 1. Synchronous Handler (Quick Job: Max 3 Leads)
// ------------------------------------------------
exports.handler = async (event) => {
	
	// --- CORS DEFINITION (CRITICAL) ---
	const CORS_HEADERS = {
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Methods': 'POST, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type',
	};
	
	if (event.httpMethod === 'OPTIONS') {
		// Mandatory for preflight checks
		return { statusCode: 200, headers: CORS_HEADERS, body: '' };
	}
	
	if (event.httpMethod !== 'POST') {
		return {	
			statusCode: 405,	
			headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
			body: JSON.stringify({ error: 'Method Not Allowed' })
		};
	}


	let requestData = {};
	try {
		requestData = JSON.parse(event.body);
		const { leadType, searchTerm, activeSignal, location, salesPersona, socialFocus, financialTerm, clientProfile, industry, size } = requestData;

		// --- STRICT VALIDATION (400 Bad Request) ---
		if (!industry || !size || !location) {
			const missingFields = [];
			if (!industry) missingFields.push('industry');
			if (!size) missingFields.push('size');
			if (!location) missingFields.push('location');

			return {
				statusCode: 400,
				headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
				body: JSON.stringify({ error: `Bad Request: Missing mandatory baseline fields for Tier 1 search: ${missingFields.join(', ')}. Please check your request payload.` })
			};
		}
		// --------------------------------------------
		
		const resolvedActiveSignal = activeSignal || "actively seeking solution or new provider";
		const quickJobTarget = leadType === 'residential' && clientProfile ? clientProfile : searchTerm;
		
		console.log(`[Handler] Running QUICK JOB (Tiered Orchestrator) for: ${industry}, ${size}, ${location}.`);


		const leads = await generateLeadsBatch(
			leadType, quickJobTarget, financialTerm, resolvedActiveSignal, location, salesPersona, socialFocus, industry, size                
		);


		// 200 Success
		return {
			statusCode: 200,
			headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
			body: JSON.stringify({ leads: leads.slice(0, 3), count: leads.length })
		};


	} catch (error) {
		console.error('Lead Generator Handler Error:', error);
		
		let message = 'Lead generation failed due to a server error.';
		if (error.message.includes('Fetch request timed out') || error.message.includes('Max retries reached')) {
			message = 'The quick lead generation job took too long and timed out (Netlify limit exceeded). Try the long job for complex queries.';
		}

		// 500 Server Error
		return {
			statusCode: 500,
			headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
			body: JSON.stringify({ error: message, details: error.message, stack: error.stack })
		};
	}
};


// ------------------------------------------------
// 2. Asynchronous Handler (Background Job)
// ------------------------------------------------
exports.background = async (event) => {
	
	// --- CORS DEFINITION (CRITICAL) ---
	const CORS_HEADERS = {
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Methods': 'POST, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type',
	};

	// Note: Background jobs don't typically see OPTIONS requests from the browser, but we include 
	// the headers for all responses to ensure consistency if the endpoint is accidentally used by a client.
	
	try {
		const requestData = JSON.parse(event.body);
		const { leadType, searchTerm, activeSignal, location, salesPersona, socialFocus, financialTerm, clientProfile, industry, size, totalLeads } = requestData;

		// --- STRICT VALIDATION (400 Bad Request) ---
		if (!industry || !size || !location) {
			const missingFields = [];
			if (!industry) missingFields.push('industry');
			if (!size) missingFields.push('size');
			if (!location) missingFields.push('location');
			
			console.error(`[Background] Missing mandatory baseline fields: ${missingFields.join(', ')}`);

			return {
				statusCode: 400,
				headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
				body: JSON.stringify({ error: `Bad Request: Missing mandatory baseline fields for Tier 1 search: ${missingFields.join(', ')}. Please check your request payload.` })
			};
		}
		// --------------------------------------------

		const resolvedActiveSignal = activeSignal || "actively seeking solution or new provider";

		console.log(`[Background] Starting LONG JOB (Tiered Orchestrator) for: ${industry}, ${size}, ${location}.`);


		// --- Execution of the Long Task ---
		const leads = await generateLeadsBatch(
			leadType, searchTerm, financialTerm, resolvedActiveSignal, location, salesPersona, socialFocus, industry, size                
		);
		
		console.log(`[Background] Job finished successfully. Generated ${leads.length} high-quality leads.`);
		
		// 200 Success
		return {
			statusCode: 200,
			headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
			body: JSON.stringify({ leads: leads, count: leads.length, message: `Successfully generated ${leads.length} leads in background.` })
		};
	} catch (err) {
		console.error('Lead Generator Background Error:', err);
		// 500 Server Error
		return {	
			statusCode: 500,	
			headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
			body: JSON.stringify({ error: err.message, details: err.cause || 'An unknown background error occurred.' })
		};
	}
};
