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
 * (Note: All previously omitted helper functions are now fully implemented or mocked for completeness.)
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
			
			// Note: Suppressing console output for retries unless it's a critical environment (keeping original logic here)
			// console.warn(`Attempt ${attempt} failed with status ${response.status}. Retrying in ${Math.round(delay)}ms...`);
			await new Promise(r => setTimeout(r, delay));
			
		} catch (err) {
			if (attempt === maxRetries) throw err;
			
			const delay = Math.random() * baseDelay * Math.pow(2, attempt - 1);
			
			// console.warn(`Attempt ${attempt} failed with network error or timeout. Retrying in ${Math.round(delay)}ms...`, err.message);
			await new Promise(r => setTimeout(r, delay));
		}
	}
	throw new Error("Max retries reached. Request failed permanently.");
};


// --------------------------------------------------------
// --- COMPLETE IMPLEMENTATIONS FOR CORE API INTERACTION ---
// --------------------------------------------------------

/**
 * Executes a Google Custom Search Engine (CSE) query.
 * @param {string} query - The search query string.
 * @param {number} numResults - The number of results to request (max 10 per call).
 * @param {string} cseId - The CSE ID (cx) to use.
 * @returns {Promise<Array<{title: string, snippet: string, link: string}>>}
 */
async function googleSearch(query, numResults = 3, cseId) {
    if (!SEARCH_MASTER_KEY || !cseId) {
        console.error("Missing Search API Key or CSE ID.");
        return [];
    }
    
    const url = `${GOOGLE_SEARCH_URL}?key=${SEARCH_MASTER_KEY}&cx=${cseId}&q=${encodeURIComponent(query)}&num=${numResults}`;

    try {
        const response = await withBackoff(() => fetchWithTimeout(url));
        const data = await response.json();

        if (data.error) {
            console.error(`Google Search API Error (CSE ID: ${cseId}):`, data.error.message);
            return [];
        }

        return data.items ? data.items.map(item => ({
            title: item.title,
            snippet: item.snippet,
            link: item.link
        })) : [];

    } catch (error) {
        console.error("Failed during Google Search attempt:", error.message);
        return [];
    }
}

// Define the required JSON Schema for lead generation
const LEAD_GENERATION_SCHEMA = {
    type: "ARRAY",
    description: "A list of qualified leads, each based on the provided search results.",
    items: {
        type: "OBJECT",
        properties: {
            companyName: { type: "STRING", description: "The name of the company or lead." },
            website: { type: "STRING", description: "The primary website or listing URL for the lead." },
            qualificationSummary: { type: "STRING", description: "A one-sentence summary explaining why this lead is a strong fit based on the search snippets." },
            painPoint: { type: "STRING", description: "A high-intent pain point or signal identified from the search results." },
            contactName: { type: "STRING", description: "A tentative contact person's name, if available or inferable." },
            industry: { type: "STRING", description: "The determined industry of the lead." },
            location: { type: "STRING", description: "The primary location of the lead." }
        },
        required: ["companyName", "website", "qualificationSummary", "industry"]
    }
};

/**
 * Uses Gemini API to qualify and structure leads from search results.
 * @param {string} query - The user-facing query about the lead generation goal.
 * @param {string} systemInstruction - The instruction defining the LLM's role and rules.
 * @returns {Promise<Array<Object>>} A list of qualified lead objects following the JSON schema.
 */
async function generateGeminiLeads(query, systemInstruction) {
    if (!GEMINI_API_KEY) {
        console.error("Missing Gemini API Key.");
        return [];
    }

    const payload = {
        contents: [{ parts: [{ text: query }] }],
        systemInstruction: { parts: [{ text: systemInstruction }] },
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: LEAD_GENERATION_SCHEMA
        },
    };
    
    const apiUrlWithKey = `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`;

    try {
        const response = await withBackoff(() => 
            fetchWithTimeout(apiUrlWithKey, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
        );
        
        const result = await response.json();
        const candidate = result.candidates?.[0];

        if (candidate && candidate.content?.parts?.[0]?.text) {
            const jsonText = candidate.content.parts[0].text.trim();
            // Gemini is designed to return valid JSON when using schema, but robust parsing is needed.
            return JSON.parse(jsonText);
        }

        console.error("Gemini failed to return content or valid JSON structure:", result);
        return [];

    } catch (error) {
        console.error('Failed during Gemini lead generation:', error.message);
        return [];
    }
}


// -------------------------------------------------
// --- MOCK/HELPER DEFINITIONS (For Runnability) ---
// -------------------------------------------------
async function checkWebsiteStatus(url) { return url.includes('broken') ? false : true; }
async function enrichEmail(lead, website) { return `contact@${website.replace(/^https?:\/\//, '').split('/')[0]}`; }
async function enrichPhoneNumber(currentNumber) { return currentNumber || '+1-555-555-1234'; }
function calculatePersonaMatchScore(lead, salesPersona) { return Math.min(1, Math.random() + 0.5); }
function computeQualityScore(lead) { 
    if (lead.qualificationSummary.includes('strong fit')) return 'High';
    if (lead.website && lead.painPoint) return 'Medium';
    return 'Low';
}
async function generatePremiumInsights(lead) { return `Insight: ${lead.companyName} is poised for growth in Q3.`; }

function rankLeads(leads) {
    // Sort by QualityScore (High, Medium, Low) and then by PersonaMatchScore (highest first)
    const scoreOrder = { 'High': 3, 'Medium': 2, 'Low': 1 };
    return leads.sort((a, b) => {
        const scoreA = scoreOrder[a.qualityScore] || 0;
        const scoreB = scoreOrder[b.qualityScore] || 0;
        if (scoreA !== scoreB) return scoreB - scoreA;
        return (b.personaMatchScore || 0) - (a.personaMatchScore || 0);
    });
}

function deduplicateLeads(leads) {
    const uniqueMap = new Map();
    for (const lead of leads) {
        // Use a combination of name and website/link for deduplication
        const key = `${lead.companyName?.toLowerCase()}_${lead.website || lead.link}`;
        if (!uniqueMap.has(key)) {
            uniqueMap.set(key, lead);
        }
    }
    return Array.from(uniqueMap.values());
}

async function enrichAndScoreLead(lead, leadType, salesPersona) {
    // Add enrichment details
    lead.website = lead.website || (lead.link ? lead.link.split('/')[2] : 'n/a');
    lead.isWebsiteLive = await checkWebsiteStatus(lead.website);
    lead.email = await enrichEmail(lead, lead.website);
    lead.phone = await enrichPhoneNumber(null); // Assuming initial lead often lacks phone

    // Compute scores
    lead.personaMatchScore = calculatePersonaMatchScore(lead, salesPersona);
    lead.qualityScore = computeQualityScore(lead);
    lead.premiumInsight = await generatePremiumInsights(lead);
    
    // Add source tier info for tracking
    lead.sourceTier = lead.tier || 1; // Default to Tier 1 if not set by search
    
    return lead;
}

function simplifySearchTerm(targetType, financialTerm, isResidential) {
    if (isResidential) return financialTerm || targetType || 'homeowner';
    // For B2B, combine the key target type/service with the financial focus
    if (targetType && financialTerm) return `${targetType} ${financialTerm}`;
    return targetType || financialTerm || 'business service';
}

const NEGATIVE_FILTERS = [ `-job`, `-careers`, `-"press release"`, `-"blog post"`, `-"how to"`, `-"ultimate guide"`];
const NEGATIVE_QUERY = NEGATIVE_FILTERS.join(' ');
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
The leads must align with the target audience: ${template}.`;


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
		.then(results => results.map(r => ({ ...r, tier: 1, type: 'Directory/Firmographic', companyName: r.title })))
	);


	// --- TIER 2: PREMIUM HIGH-INTENT SEARCHES (Conditional) ---
	if (hasPremiumKeywords) {
		console.log("[Tier 2: Premium] High-intent keywords detected. Executing specialized searches.");

		// 1. B2B_PAIN_CSE_ID (Review/Pain Sites) - NOW TIER 2 ONLY
		if (B2B_PAIN_CSE_ID) {
			const query = `${shortTargetType} AND ("pain point" OR "switching from" OR "frustrated with") in "${location}" ${NEGATIVE_QUERY}`;
			searchPromises.push(
				googleSearch(query, 2, B2B_PAIN_CSE_ID)
				.then(results => results.map(r => ({ ...r, tier: 2, type: 'Pain/Review', companyName: r.title })))
			);
		}
		
		// 2. CORP_COMP_CSE_ID (Competitor Searches)
		if (CORP_COMP_CSE_ID && targetType) {
			const query = `${targetType} competitors vs alternatives ${NEGATIVE_QUERY}`;
			searchPromises.push(
				googleSearch(query, 2, CORP_COMP_CSE_ID)
				.then(results => results.map(r => ({ ...r, tier: 2, type: 'Competitor', companyName: r.title })))
			);
		}
		
		// 3. TECH_SIM_CSE_ID (Tech stack/Similar company searches)
		if (TECH_SIM_CSE_ID && financialTerm) {
			const query = `${financialTerm} stack recent investments ${NEGATIVE_QUERY}`;
			searchPromises.push(
				googleSearch(query, 1, TECH_SIM_CSE_ID)
				.then(results => results.map(r => ({ ...r, tier: 2, type: 'Tech/Financial', companyName: r.title })))
			);
		}
		
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
	const searchSnippets = allSearchResults.map(r => 
        `Title: ${r.title}\nSnippet: ${r.snippet}\nLink: ${r.link}\nSource Type: ${r.type}\n---`
    ).join('\n');
    
	const geminiQuery = `Generate leads for a ${leadType} audience in the ${industry} sector (${size}). Base your leads STRICTLY on the following AGGREGATED search results from specialized engines, focusing on the company/lead, website, and a strong qualification summary:
    
    SEARCH RESULTS:
    ${searchSnippets}`;

	const geminiLeads = await generateGeminiLeads(geminiQuery, systemInstruction);
	
	// 4. Final Enrichment and Ranking (Concurrent)
	let allLeads = deduplicateLeads(geminiLeads);
	
	// Add firmographic data back to the leads from the request payload
	allLeads = allLeads.map(lead => ({
	    ...lead,
	    industry: lead.industry || industry,
	    location: lead.location || location,
	    size: size,
	}));
	
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
		if (error.message.includes('Configuration Error')) {
			message = error.message;
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
		const { leadType, searchTerm, activeSignal, location, salesPersona, socialFocus, financialTerm, clientProfile, industry, size } = requestData;

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
		
		let message = err.message;
		if (err.message.includes('Configuration Error')) {
			message = err.message;
		}
		
		// 500 Server Error
		return {	
			statusCode: 500,	
			headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
			body: JSON.stringify({ error: message, details: err.cause || 'An unknown background error occurred.' })
		};
	}
};
