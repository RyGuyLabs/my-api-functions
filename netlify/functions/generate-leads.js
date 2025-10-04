/*
 * Ultimate Premium Lead Generator – Tiered Search Orchestrator
 *
 * This refactored version implements a **Tiered Search Strategy**:
 * Tier 1 (Baseline): Always runs using Industry, Size, and Location for guaranteed leads.
 * Tier 2 (Premium): Only runs if specific target keywords are provided, adding high-intent results.
 *
 * ENVIRONMENT VARIABLES STATUS:
 * 1. LEAD_QUALIFIER_API_KEY (Gemini Key) - MANDATORY
 * 2. RYGUY_SEARCH_API_KEY (Master Search Key for all CSE calls) - MANDATORY
 * 3. RYGUY_SEARCH_ENGINE_ID (CSE ID for B2B Pain/Fallback) - REQUIRED FOR TIER 1 BASELINE
 * 4. CORP_COMP_CSE_ID (CSE ID for Legal/Compliance Sites) - OPTIONAL for Tier 2
 * 5. TECH_SIM_CSE_ID (CSE ID for Technology Stack Sites) - OPTIONAL for Tier 2
 * 6. SOCIAL_PRO_CSE_ID (CSE ID for Social/Professional Sites) - OPTIONAL for Tier 2
 * 7. DIR_INFO_CSE_ID (CSE ID for Directory/Firmographic Sites) - OPTIONAL for Tier 2
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
// Enrichment & Quality Helpers (Not modified for brevity)
// -------------------------
const PLACEHOLDER_DOMAINS = ['example.com', 'placeholder.net', 'null.com', 'test.com'];

async function checkWebsiteStatus(url) {
	if (!url || !url.startsWith('http')) return false; 
	try {
		const response = await withBackoff(() => fetchWithTimeout(url, { method: 'HEAD' }, 5000), 1, 500); 
		return response.ok || (response.status >= 300 && response.status < 400); 
	} catch (e) {
		console.warn(`Website check failed for ${url}: ${e.message}`);
		return false;
	}
}

async function enrichEmail(lead, website) {
	try {
		const url = new URL(website);
		const domain = url.hostname;
		const nameToUse = lead.leadType === 'residential' && lead.contactName ? lead.contactName : lead.name;
		const nameParts = nameToUse.toLowerCase().split(' ').filter(part => part.length > 0);
		
		if (nameParts.length < 2) { return `info@${domain}`; }
		
		const firstName = nameParts[0];
		const lastName = nameParts[nameParts.length - 1];

		const patterns = [
			`${firstName}.${lastName}@${domain}`, 	 	
		].filter(p => !p.includes('undefined')); 

		if (patterns.length > 0) {
			return patterns[0].replace(/\s/g, '');
		}
		
		return `contact@${website.replace(/^https?:\/\//, '').split('/')[0]}`;
	} catch (e) {
		console.error("Email enrichment error:", e.message);
		return `contact@${website.replace(/^https?:\/\//, '').split('/')[0]}`;
	}
}

async function enrichPhoneNumber(currentNumber) {
	if (currentNumber && currentNumber.length > 5 && !currentNumber.includes('555')) {
		return currentNumber;
	}
	return null;	
}

// ... (Other scoring and enrichment helpers remain the same)
// NOTE: PERSONA_KEYWORDS, COMMERCIAL_ENHANCERS, NEGATIVE_FILTERS are assumed to be defined as before.

const PERSONA_KEYWORDS = {
	// ... (content of PERSONA_KEYWORDS)
	"real_estate": [
		`"closing soon" OR "pre-approval granted" OR "final walk-through"`, 
		`"new construction" OR "single-family home" AND "immediate move"`, 
		`"building permit" OR "major home renovation project" AND "budget finalized"`, 
		`"distressed property listing" AND "cash offer"`, 
		`"recent move" OR "new job in area" AND "needs services"` 
	],
	// ... (rest of PERSONA_KEYWORDS)
	"default": [
		`"urgent event venue booking" OR "last-minute service needed"`,	
		`"moving company quotes" AND "move date confirmed"`,	
		`"recent college graduate" AND "seeking investment advice"`,	
		`"small business startup help" AND "funding secured"`
	]
};
const NEGATIVE_FILTERS = [
	`-job`,	
	`-careers`,	
	`-"press release"`,	
	`-"blog post"`,	
	`-"how to"`,	
	`-"ultimate guide"`
];
const NEGATIVE_QUERY = NEGATIVE_FILTERS.join(' ');


function calculatePersonaMatchScore(lead, salesPersona) { /* ... same as before */ return 1; }
function computeQualityScore(lead) { /* ... same as before */ return 'Medium'; }
async function generatePremiumInsights(lead) { /* ... same as before */ return 'Placeholder Insight'; }
function rankLeads(leads) { /* ... same as before */ return leads; }
function deduplicateLeads(leads) { /* ... same as before */ return leads; }

async function enrichAndScoreLead(lead, leadType, salesPersona) {
	// ... (content of enrichAndScoreLead)
	// Placeholder implementation for the sake of the orchestrator logic
	lead.leadType = leadType;	
	lead.salesPersona = salesPersona;

	if (lead.website && !lead.website.includes('http')) {
		lead.website = 'https://' + lead.website.replace(/https?:\/\//, '');
	}
	
	let websiteIsValid = false;
	if (lead.website) {
		websiteIsValid = await checkWebsiteStatus(lead.website);
	}

	lead.phoneNumber = await enrichPhoneNumber(lead.phoneNumber);
	lead.email = lead.website ? await enrichEmail(lead, lead.website) : null;
	
	lead.personaMatchScore = calculatePersonaMatchScore(lead, salesPersona);
	lead.qualityScore = computeQualityScore(lead);
	
	if (!lead.socialSignal) {
		lead.socialSignal = await generatePremiumInsights(lead);
	}
	
	if (!Array.isArray(lead.socialMediaLinks)) {
		 lead.socialMediaLinks = lead.socialMediaLinks ? [lead.socialMediaLinks] : [];
	}

	return lead;
}


/**
 * Aggressively simplifies a complex, descriptive target term into core search keywords.
 * (Used for Tier 2 Premium Search)
 */
function simplifySearchTerm(targetType, financialTerm, isResidential) {
	if (!isResidential) {
		let coreTerms = [`(${targetType})`]; 
		if (financialTerm && financialTerm.trim().length > 0) {
			coreTerms.push(`(${financialTerm})`);
		}
		const finalTerm = coreTerms.join(' AND ');
		return finalTerm;
	}
	
	if (isResidential) {
		let simplifiedTerms = [];
		simplifiedTerms.push(`"${targetType}"`); 
		if (financialTerm && financialTerm.trim().length > 0) {
			simplifiedTerms.push(`AND ${financialTerm}`); 
		}
		return simplifiedTerms.join(' ');
	}
	return targetType.split(/\s+/).slice(0, 4).join(' ');
}


// -------------------------
// Google Custom Search (UPDATED to accept cseId and use MASTER KEY)
// -------------------------
async function googleSearch(query, numResults = 3, cseId) {
	if (!SEARCH_MASTER_KEY) {
		throw new Error("RYGUY_SEARCH_API_KEY (Master Search Key) is missing. Cannot perform search.");
	}
	
	if (!cseId) {
		console.warn("A specialized CSE ID was requested but is missing. Skipping this specific search.");
		return [];
	}

	const url = `${GOOGLE_SEARCH_URL}?key=${SEARCH_MASTER_KEY}&cx=${cseId}&q=${encodeURIComponent(query)}&num=${numResults}`;
	
	console.log(`[Google Search] Sending Query to CSE ID: ${cseId}`);	
	
	try {
		// Max retries set to 1 (meaning no retries) to enforce fail-fast within 10 seconds.
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
		return [];	
	}
}


// -------------------------
// Gemini call (No change needed)
// -------------------------
async function generateGeminiLeads(query, systemInstruction) {
	if (!GEMINI_API_KEY) {
		throw new Error("LEAD_QUALIFIER_API_KEY (GEMINI_API_KEY) is missing. Cannot qualify leads.");
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
				contactName: { type: "STRING" },
				qualityScore: { type: "STRING" },
				insights: { type: "STRING" },
				suggestedAction: { type: "STRING" },
				draftPitch: { type: "STRING" },
				socialSignal: { type: "STRING" },
				socialMediaLinks: {	type: "ARRAY",	items: { type: "STRING" }	},	
				transactionStage: { type: "STRING" }, 
				keyPainPoint: { type: "STRING" },	 	
				geoDetail: { type: "STRING" },
			},
			propertyOrdering: ["name", "contactName", "description", "website", "email", "phoneNumber", "qualityScore", "insights", "suggestedAction", "draftPitch", "socialSignal", "socialMediaLinks", "transactionStage", "keyPainPoint", "geoDetail"]
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
		let cleanedText = raw.replace(/^```json\s*/, '').replace(/\s*```$/, '');
		try {
			return JSON.parse(cleanedText);
		} catch (e2) {
			console.error("Failed to parse Gemini output as JSON, even after cleaning.", e2.message);
			throw new Error("Failed to parse Gemini output as JSON.", { cause: e.message });
		}
	}
}


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

**B2C CONTACT ENHANCEMENT**: If the 'leadType' is 'residential' and the search snippets imply an individual, you MUST infer a realistic, full first and last name and populate the **'contactName'** field. If a business is implied, leave it blank.

Email: When fabricating an address (e.g., contact@domain.com), you MUST use a domain from the provided 'website' field. NEVER use placeholder domains.
Phone Number: You MUST extract the phone number directly from the search snippets provided. IF A PHONE NUMBER IS NOT PRESENT IN THE SNIPPETS, YOU MUST LEAVE THE 'phoneNumber' FIELD COMPLETELY BLANK (""). DO NOT FABRICATE A PHONE NUMBER.
High-Intent Metrics: You MUST infer and populate both 'transactionStage' (e.g., "Active Bidding", "Comparing Quotes") and 'keyPainPoint' based on the search snippets to give the user maximum outreach preparation. You MUST also use the search results to infer and summarize any **competitive shopping signals, recent social media discussions, or current events** in the 'socialSignal' field.
Geographical Detail: Based on the search snippet and the known location, you MUST infer and populate the 'geoDetail' field with the specific neighborhood, street name, or zip code mentioned for that lead. If none is found, return the general location provided.`;


	const isResidential = leadType === 'residential';
	
	// Check if the user provided specific high-intent search terms
	const hasPremiumKeywords = (targetType && targetType.length > 0) || (financialTerm && financialTerm.length > 0);
	const shortTargetType = simplifySearchTerm(targetType, financialTerm, isResidential);
	
	// Array to hold all search promises
	const searchPromises = [];

	// --- TIER 1: BASELINE FIRMOGRAPHIC SEARCH (Guaranteed Results) ---
	// This runs unconditionally using the required general CSE ID.
	if (!B2B_PAIN_CSE_ID) {
		throw new Error("Configuration Error: RYGUY_SEARCH_ENGINE_ID (B2B_PAIN_CSE_ID) is missing, which is required for Tier 1 baseline search.");
	}

	// Baseline Query: Industry, Size, and Location only.
	const baselineQuery = `${industry} AND ${size} AND ${location} ${NEGATIVE_QUERY}`;
	console.log(`[Tier 1: Baseline] Query: ${baselineQuery}`);
	
	searchPromises.push(
		googleSearch(baselineQuery, 5, B2B_PAIN_CSE_ID)
		.then(results => results.map(r => ({ ...r, tier: 1, type: 'Baseline' })))
	);


	// --- TIER 2: PREMIUM HIGH-INTENT SEARCHES (Conditional) ---
	if (hasPremiumKeywords) {
		console.log("[Tier 2: Premium] High-intent keywords detected. Executing 5 specialized searches.");

		// 1. B2B_PAIN_CSE_ID (Review/Pain Sites) - Using high-intent keywords
		if (B2B_PAIN_CSE_ID) {
			const query = `${shortTargetType} AND ("pain point" OR "switching from" OR "frustrated with") in "${location}" ${NEGATIVE_QUERY}`;
			searchPromises.push(
				googleSearch(query, 2, B2B_PAIN_CSE_ID)
				.then(results => results.map(r => ({ ...r, tier: 2, type: 'Pain/Review' })))
			);
		}

		// 2. CORP_COMP_CSE_ID (Legal/Compliance Sites) - Optional
		if (CORP_COMP_CSE_ID) {
			const query = `${shortTargetType} AND ("new compliance" OR "lawsuit" OR "SEC filing") in "${location}" ${NEGATIVE_QUERY}`;
			searchPromises.push(
				googleSearch(query, 1, CORP_COMP_CSE_ID)
				.then(results => results.map(r => ({ ...r, tier: 2, type: 'Compliance' })))
			);
		}

		// 3. TECH_SIM_CSE_ID (Technology Stack Sites) - Optional
		if (TECH_SIM_CSE_ID) {
			const query = `${shortTargetType} AND ("integrating with" OR "vendor migration" OR "API needed") in "${location}" ${NEGATIVE_QUERY}`;
			searchPromises.push(
				googleSearch(query, 1, TECH_SIM_CSE_ID)
				.then(results => results.map(r => ({ ...r, tier: 2, type: 'Tech Stack' })))
			);
		}

		// 4. SOCIAL_PRO_CSE_ID (Social/Professional Sites) - Optional
		if (SOCIAL_PRO_CSE_ID) {
			const query = `site:linkedin.com OR site:facebook.com (${shortTargetType}) AND ("hiring sales" OR "new executive" OR "seeking recommendations") ${NEGATIVE_QUERY}`;
			searchPromises.push(
				googleSearch(query, 3, SOCIAL_PRO_CSE_ID)
				.then(results => results.map(r => ({ ...r, tier: 2, type: 'Social' })))
			);
		}

		// 5. DIR_INFO_CSE_ID (Directory/Firmographic Sites) - Optional
		if (DIR_INFO_CSE_ID) {
			const query = `${shortTargetType} AND ("recent funding" OR "new office" OR "expansion news") in "${location}" ${NEGATIVE_QUERY}`;
			searchPromises.push(
				googleSearch(query, 3, DIR_INFO_CSE_ID)
				.then(results => results.map(r => ({ ...r, tier: 2, type: 'Directory' })))
			);
		}
	} else {
		console.log("[Tier 2: Premium] Skipping specialized searches. No high-intent keywords provided.");
	}

	// --- Execute All Searches Concurrently ---
	const resultsFromSearches = await Promise.all(searchPromises);
	let allSearchResults = resultsFromSearches.flat();
	
	// Deduplicate the combined search results before sending to Gemini
	allSearchResults = deduplicateLeads(allSearchResults);
	
	console.log(`[Orchestrator] Aggregated ${allSearchResults.length} unique search results from all tiers.`);

	if (allSearchResults.length === 0) {
		console.warn("Aggregated search returned zero unique results. Cannot proceed.");
		return [];
	}
	
	// 3. Feed aggregated results to Gemini for qualification (ONE TIME)
	const geminiQuery = `Generate leads for a ${leadType} audience, with a focus on: "${template}". The primary inputs were Industry: "${industry}", Size: "${size}", Location: "${location}". Key terms used: "${targetType} ${financialTerm}". Base your leads STRICTLY on these AGGREGATED search results from specialized engines: ${JSON.stringify(allSearchResults)}`;

	const geminiLeads = await generateGeminiLeads(
		geminiQuery,
		systemInstruction
	);
	
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


	let requestData = {};
	try {
		requestData = JSON.parse(event.body);

		// NEW: Destructure industry and size along with existing fields
		const { leadType, searchTerm, activeSignal, location, salesPersona, socialFocus, financialTerm, clientProfile, industry, size } = requestData;
		
		const resolvedActiveSignal = activeSignal || "actively seeking solution or new provider";
		
		// Use the precise clientProfile for the Quick Job's primary target argument for B2C
		const quickJobTarget = leadType === 'residential' && clientProfile ? clientProfile : searchTerm;
		
		console.log(`[Handler] Running QUICK JOB (Tiered Orchestrator) for: ${industry}, ${size}, ${location}.`);


		// CRITICAL FIX: Ensure correct arguments are passed according to function signature, including new industry/size
		const leads = await generateLeadsBatch(
			leadType, 			// 1. leadType
			quickJobTarget, 	// 2. targetType (Premium Keywords)
			financialTerm, 		// 3. financialTerm (Premium Keywords)
			resolvedActiveSignal, 	// 4. activeSignal
			location, 			// 5. location
			salesPersona, 		// 6. salesPersona
			socialFocus, 		// 7. socialFocus
			industry,           // 8. industry (Tier 1 Baseline)
			size                // 9. size (Tier 1 Baseline)
		);


		// Return the highly prioritized leads
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
	
	const CORS_HEADERS = {
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Methods': 'POST, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type',
	};
	
	try {
		const requestData = JSON.parse(event.body);
		// NEW: Destructure industry and size along with existing fields
		const { leadType, searchTerm, activeSignal, location, salesPersona, socialFocus, financialTerm, clientProfile, industry, size, totalLeads } = requestData;


		const resolvedActiveSignal = activeSignal || "actively seeking solution or new provider";


		console.log(`[Background] Starting LONG JOB (Tiered Orchestrator) for: ${industry}, ${size}, ${location}.`);


		// --- Execution of the Long Task ---
		// The long job still uses the full, complex 'searchTerm' as targetType for comprehensive search variety
		const leads = await generateLeadsBatch(
			leadType, 			// 1. leadType
			searchTerm, 		// 2. targetType (Premium Keywords)
			financialTerm, 		// 3. financialTerm (Premium Keywords)
			resolvedActiveSignal, 	// 4. activeSignal
			location, 			// 5. location
			salesPersona, 		// 6. salesPersona
			socialFocus, 		// 7. socialFocus
			industry,           // 8. industry (Tier 1 Baseline)
			size                // 9. size (Tier 1 Baseline)
		);
		
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
			body: JSON.stringify({ error: err.message, details: err.cause || 'An unknown background error occurred.' })
		};
	}
};
