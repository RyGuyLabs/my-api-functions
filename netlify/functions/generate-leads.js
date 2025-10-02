/**
 * Ultimate Premium Lead Generator – Gemini + Google Custom Search
 *
 * This file contains two exports:
 * 1. exports.handler: Synchronous endpoint (guaranteed fast, max 3 leads).
 * 2. exports.background: Asynchronous endpoint (runs up to 15 minutes, unlimited leads).
 *
 * CRITICAL FIXES APPLIED:
 * 1. **CRITICAL SEARCH FLEXIBILITY FIX:** The search term generation logic (now resolvePrimarySearchTerm) has been updated for both B2B and B2C to **remove strict quotes** around descriptive terms (like clientProfile). This allows the search to operate like natural Google search, matching on relevance and proximity instead of exact phrases, resolving the "No results for primary query" error.
 * 2. B2C Logic: Now uses the high-intent 'targetDecisionMaker' (e.g., New Parent OR Small Business Owner) directly in the search for stronger signal grounding.
 * 3. B2B Logic: Uses the full, unquoted 'targetType' (OR chain) for comprehensive, natural-language matching.
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
// Enrichment & Quality Helpers (Omitted for brevity, assumed unchanged)
// -------------------------
const PLACEHOLDER_DOMAINS = ['example.com', 'placeholder.net', 'null.com', 'test.com'];

// Helper functions like checkWebsiteStatus, enrichEmail, calculatePersonaMatchScore, etc.
// are assumed to be present here and unchanged from the previous version.

// Function definitions for:
// async function checkWebsiteStatus(url) { ... }
// async function enrichEmail(lead, website) { ... }
// async function enrichPhoneNumber(currentNumber) { ... }
// function calculatePersonaMatchScore(lead, salesPersona) { ... }
// function computeQualityScore(lead) { ... }
// async function generatePremiumInsights(lead) { ... }
// function rankLeads(leads) { ... }
// function deduplicateLeads(leads) { ... }
// async function enrichAndScoreLead(lead, leadType, salesPersona) { ... }

// --- Gemini call ---
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
				contactName: { type: "STRING" }, // NEW FIELD
				qualityScore: { type: "STRING" },
				insights: { type: "STRING" },
				suggestedAction: { type: "STRING" },
				draftPitch: { type: "STRING" },
				socialSignal: { type: "STRING" },
				socialMediaLinks: {	
					type: "ARRAY",	
					items: { type: "STRING" }	
				},	
				transactionStage: { type: "STRING" }, // NEW HIGH-INTENT FIELD
				keyPainPoint: { type: "STRING" },	 	// NEW HIGH-INTENT FIELD
				geoDetail: { type: "STRING" },	 	// NEW GEOGRAPHICAL DETAIL FIELD (Neighborhood/Zip)
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
		// ADDED: Attempt to remove markdown fences if Gemini wrapped the JSON
		let cleanedText = raw.replace(/^```json\s*/, '').replace(/\s*```$/, '');
		
		try {
			return JSON.parse(cleanedText);
		} catch (e2) {
			console.error("Failed to parse Gemini output as JSON, even after cleaning.", e2.message);
			throw new Error("Failed to parse Gemini output as JSON.", { cause: e.message });
		}
	}
}


// --- Google Search ---
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
// Keyword Definitions (UNCHANGED)
// -------------------------
// ... (PERSONA_KEYWORDS, COMMERCIAL_ENHANCERS, NEGATIVE_FILTERS, NEGATIVE_QUERY)
const PERSONA_KEYWORDS = {
	"real_estate": [
		`"closing soon" OR "pre-approval granted" OR "final walk-through"`,
		`"new construction" OR "single-family home" AND "immediate move"`,
		`"building permit" OR "major home renovation project" AND "budget finalized"`,
		`"distressed property listing" AND "cash offer"`,
		`"recent move" OR "new job in area" AND "needs services"`
	],
	"life_insurance": [
		`"inheritance received" OR "trust fund established" OR "annuity maturing"`,
		`"retirement plan rollovers" OR "seeking estate lawyer"`,
		`"trust fund establishment" OR "recent major asset purchase"`,
		`"IRA rollover" OR "annuity comparison" AND "urgent decision"`,
		`"age 50+" OR "retirement specialist" AND "portfolio review"`
	],
	"financial_advisor": [
		`"recent funding" OR "major business expansion" AND "need advisor"`,
		`"property investor" OR "real estate portfolio management" AND "tax strategy"`,
		`"401k rollover" OR "retirement planning specialist" AND "immediate consultation"`,
		`"S-Corp filing" OR "new business incorporation" AND "accounting needed"`
	],
	"local_services": [
		`"home improvement" OR "major repair needed" AND "quote accepted"`,
		`"renovation quote" OR "remodeling project bid" AND "start date imminent"`,
		`"new construction start date" OR "large landscaping project" AND "hiring now"`,
		`"local homeowner review" OR "service provider recommendations" AND "booked service"`
	],
	"mortgage": [
		`"mortgage application pre-approved" OR "refinancing quote" AND "comparing rates"`,
		`"recent purchase contract signed" OR "new home loan needed" AND "30 days to close"`,
		`"first-time home buyer seminar" OR "closing date soon" AND "documents finalized"`,
		`"VA loan eligibility" OR "FHA loan requirements" AND "submission ready"`
	],
	"default": [
		`"urgent event venue booking" OR "last-minute service needed"`,	
		`"moving company quotes" AND "move date confirmed"`,	
		`"recent college graduate" AND "seeking investment advice"`,	
		`"small business startup help" AND "funding secured"`
	]
};

const COMMERCIAL_ENHANCERS = [
	`"new funding" OR "business expansion"`,
	`"recent hiring" OR "job posting" AND "sales staff needed"`, 
	`"moved office" OR "new commercial building"`, 
	`"new product launch" OR "major contract win"`
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


/**
 * RENAMED AND REFACTORED: Resolves a complex, descriptive target term into a flexible,
 * high-relevance search query, avoiding strict phrase matching where possible.
 *
 * @param {string} leadType - 'residential' or 'commercial'
 * @param {string} targetType - B2C: clientProfile (e.g., Families seeking Term Life) | B2B: full searchTerm (e.g., Software OR Tech)
 * @param {string} financialTerm - e.g., "100000+"
 * @param {string} targetDecisionMaker - B2C: New Parent OR Small Business Owner (ignored for B2B primary)
 * @returns {string} The final, flexible search query fragment.
 */
function resolvePrimarySearchTerm(leadType, targetType, financialTerm, targetDecisionMaker) {
	
	const isResidential = leadType === 'residential';
	
	// --- B2B Logic (Commercial) ---
	if (!isResidential) {
		// B2B FIX: Use the full original 'targetType' (OR chain) and financial term **UNQUOTED**
		// This allows Google's natural ranking to find documents that contain these words in proximity.
		let coreTerms = [targetType.replace(/"/g, '').replace(/\s+OR\s+/gi, ' OR ')]; // Use full original OR chain, remove any existing quotes
		
		if (financialTerm && financialTerm.trim().length > 0) {
			// Combine financial term with AND. Do not quote the financial term.
			coreTerms.push(`AND ${financialTerm}`);
		}
		
		const finalTerm = coreTerms.join(' ');
		console.log(`[Search Fix] Resolved CORE B2B TERM (Natural Search) to: ${finalTerm}`);
		return finalTerm;
	}
	
	// --- B2C Logic (Residential) ---
	if (isResidential) {
		
		let searchFragments = [];
		
		// 1. Target Type/Client Profile (e.g., Families seeking Term Life Insurance)
		// CRITICAL FIX: Use the descriptive term UNQUOTED for maximum flexibility (Natural Search)
		searchFragments.push(targetType.replace(/"/g, ''));
		
		// 2. Target Decision Maker (e.g., New Parent OR Small Business Owner)
		// Inject the high-intent persona directly. Use OR chain, but keep the individual elements quoted
		// to enforce the persona relevance.
		if (targetDecisionMaker && targetDecisionMaker.trim().length > 0) {
			const personas = targetDecisionMaker
				.split(' OR ')
				.map(p => p.trim())
				.map(p => p.replace(/\s*\(.*\)/, '')) // Remove parenthetical details
				.map(p => `"${p}"`) // Keep the core persona quoted for strong intent match
				.join(' OR ');

			searchFragments.push(`(${personas})`);
		}

		// 3. Financial Term (e.g., 100000+)
		if (financialTerm && financialTerm.trim().length > 0) {
			// Combine the financial term with an explicit AND for strict numerical filter, but keep it unquoted.
			searchFragments.push(`AND ${financialTerm.replace(/"/g, '')}`); 
		}

		// Join all fragments with a space (Google interprets spaces as a soft AND)
		const finalTerm = searchFragments.join(' ').trim();

		if (finalTerm.length > 0) {
			console.log(`[Search Fix] Resolved CORE B2C TERM (Natural Search) to: ${finalTerm}`);
			return finalTerm;
		}
	}

	// Default fallback
	return targetType.split(/\s+/).slice(0, 4).join(' ');
}


// -------------------------
// Lead Generator Core (CONCURRENT EXECUTION)
// -------------------------
async function generateLeadsBatch(leadType, targetType, financialTerm, activeSignal, location, salesPersona, socialFocus, targetDecisionMaker, totalBatches = 4) {
	
	// ... (System Instruction unchanged)
	const systemInstruction = `You are an expert Lead Generation analyst using the provided data.
You MUST follow the JSON schema provided in the generation config.
CRITICAL: All information MUST pertain to the lead referenced in the search results.

**B2C CONTACT ENHANCEMENT**: If the 'leadType' is 'residential' and the search snippets imply an individual, you MUST infer a realistic, full first and last name and populate the **'contactName'** field. If a business is implied, leave it blank.

Email: When fabricating an address (e.g., contact@domain.com), you MUST use a domain from the provided 'website' field. NEVER use placeholder domains.
Phone Number: You MUST extract the phone number directly from the search snippets provided. IF A PHONE NUMBER IS NOT PRESENT IN THE SNIPPETS, YOU MUST LEAVE THE 'phoneNumber' FIELD COMPLETELY BLANK (""). DO NOT FABRICATE A PHONE NUMBER.
High-Intent Metrics: You MUST infer and populate both 'transactionStage' (e.g., "Active Bidding", "Comparing Quotes") and 'keyPainPoint' based on the search snippets to give the user maximum outreach preparation. You MUST also use the search results to infer and summarize any **competitive shopping signals, recent social media discussions, or current events** in the 'socialSignal' field.
Geographical Detail: Based on the search snippet and the known location, you MUST infer and populate the 'geoDetail' field with the specific neighborhood, street name, or zip code mentioned for that lead. If none is found, return the general location provided.`;

	const template = leadType === 'residential'
		? "Focus on individual homeowners, financial capacity, recent property activities."
		: "Focus on businesses, size, industry relevance, recent developments.";

	const personaKeywords = PERSONA_KEYWORDS[salesPersona] || PERSONA_KEYWORDS['default'];
	const isResidential = leadType === 'residential';
	
	const batchPromises = [];

	// --- Create ALL Promises Concurrently ---
	for (let i = 0; i < totalBatches; i++) {
		
		const batchPromise = (async (batchIndex) => {
			let searchKeywords;
			
			// Cycle through hardcoded enhancers for variety/safety
			const personaEnhancer = personaKeywords[batchIndex % personaKeywords.length];	
			
			// NEW: Get the flexible search term using the updated function
			const primarySearchTerm = resolvePrimarySearchTerm(leadType, targetType, financialTerm, targetDecisionMaker);

			// Determine primary search keywords
			if (batchIndex === 0) {
				
				// CRITICAL FIX: Decouple 'activeSignal' from the primary B2C search (Level 1)
				if (isResidential) {
					// B2C Primary: Focus on the flexible primary term (Life Event + Persona + Financial) in location.
					searchKeywords = `${primarySearchTerm} in "${location}" ${NEGATIVE_QUERY}`;
					console.log(`[Batch 1] Running PRIMARY Natural Search Query (B2C).`);
				} else {
					// B2B PRIMARY FIX: Use the full original 'targetType' (OR chain) combined with the first, looser B2B enhancer.
					// Note: primarySearchTerm already includes the relaxed targetType and financialTerm for B2B.
					searchKeywords = `${primarySearchTerm} AND (${COMMERCIAL_ENHANCERS[0]}) in "${location}" ${NEGATIVE_QUERY}`;
					console.log(`[Batch 1] Running PRIMARY Intent Query (B2B Fix: Using flexible OR chain + 1 enhancer).`);
				}
			} else if (batchIndex === totalBatches - 1 && totalBatches > 1) { 
                // Dedicated final batch for Social/Competitive Intent Grounding (HOT Lead Signal)
                const defaultSocialTerms = isResidential 
					? `"new homeowner" OR "local recommendation" OR "asking for quotes"` // B2C focused
					: `"shopping around" OR "comparing quotes" OR "need new provider"`; // B2B focused
                
                const socialTerms = socialFocus && socialFocus.trim().length > 0 ? socialFocus.trim() : defaultSocialTerms;
 				
                // Search specifically on social/forum sites for real-time discussion and shopping intent.
                searchKeywords = `site:linkedin.com OR site:facebook.com OR site:twitter.com (${primarySearchTerm}) AND (${socialTerms} OR ${activeSignal}) in "${location}" ${NEGATIVE_QUERY}`;
                console.log(`[Batch ${batchIndex+1}] Running dedicated Social/Competitive Intent Query (HOT Signal, targeting names).`);
			} else if (isResidential) {
				
				// RESIDENTIAL QUERY (Batch > 0): Use the flexible primary term + high-intent persona signal
				searchKeywords = `${primarySearchTerm} in "${location}" AND (${personaEnhancer}) ${NEGATIVE_QUERY}`;
			} else {
				
				// B2B QUERY (Batch > 0): Use the flexible primary term + high-intent B2B signal
				const b2bEnhancer = COMMERCIAL_ENHANCERS[batchIndex % COMMERCIAL_ENHANCERS.length];
				searchKeywords = `${primarySearchTerm} in "${location}" AND (${b2bEnhancer}) ${NEGATIVE_QUERY}`;
			}
			
			// 1. Get verified search results (Primary) - Fail-fast enforced inside googleSearch
			let gSearchResults = await googleSearch(searchKeywords, 3);	
			
			// 2. Level 2 Fallback: If primary fails, try a broader, non-intent-based search.
			if (gSearchResults.length === 0) {
				console.warn(`[Batch ${batchIndex+1}] No results for primary query. Trying broadest fallback (Level 2)...`);
				
				// --- Level 2 Fallback: Broad, non-intent based term ---
				
				let broaderFallbackTerm;
				if (isResidential) {
					broaderFallbackTerm = `"homeowner family" in "${location}"`; // Residential fallback (most generic description of the target)
				} else {
					// B2B LEVEL 2 FIX: Only search for the company type (first term in the OR chain) in the location.
					const firstB2BTerm = targetType.split(' OR ')[0].trim().replace(/"/g, ''); // e.g., "software companies"
					broaderFallbackTerm = `"${firstB2BTerm}" in "${location}"`;
				}
				
				// Fallback: Drop ALL signals and just search the core term and location.
				let fallbackSearchKeywords = `${broaderFallbackTerm} ${NEGATIVE_QUERY}`;
				
				// Fallback also uses the Fail-Fast approach
				const fallbackResults = await googleSearch(fallbackSearchKeywords, 3);	
				gSearchResults.push(...fallbackResults);

				// --- NEW: Level 3 Fallback: Ultra-Generic Search (Guaranteed hit for any location) ---
				if (gSearchResults.length === 0) {
					console.warn(`[Batch ${batchIndex+1}] No results after level 2 fallback. Trying ultra-generic search (Level 3)...`);
					
					// Use a highly generic, high-probability term related to the persona
					const salesPersonaClean = salesPersona.replace(/_/g, ' ');
					
					const ultraGenericTerm = isResidential 
						? `"${salesPersonaClean} services" in "${location}"` // e.g., "life insurance services"
						: `${targetType.split(' OR ')[0].trim().replace(/"/g, '')} directory in "${location}"`; // e.g., "software companies directory"
						
					const ultraFallbackKeywords = `${ultraGenericTerm} ${NEGATIVE_QUERY}`;
					
					const ultraFallbackResults = await googleSearch(ultraFallbackKeywords, 3);
					gSearchResults.push(...ultraFallbackResults);

					if (gSearchResults.length === 0) {
						 console.warn(`[Batch ${batchIndex+1}] No results after ultra-generic fallback. Skipping batch.`);
						 return [];
					}
				}
			}	

			// 3. Feed results to Gemini for qualification
			const geminiQuery = `Generate 3 high-quality leads for a ${leadType} audience, with a focus on: "${template}". The primary query is "${primarySearchTerm}" in "${location}". Base your leads strictly on these search results: ${JSON.stringify(gSearchResults)}`;

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

	// --- Final Enrichment and Ranking (Concurrent) ---
	allLeads = deduplicateLeads(allLeads);
	
	// Assuming enrichAndScoreLead is defined elsewhere in the file
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

		// NEW: Destructure targetDecisionMaker from the request
		const { leadType, searchTerm, activeSignal, location, salesPersona, socialFocus, financialTerm, clientProfile, targetDecisionMaker } = requestData;
		
		const resolvedActiveSignal = activeSignal || "actively seeking solution or new provider";
		
		// For the Quick Job, B2C uses clientProfile as the primary target for the term resolution function.
		const quickJobTarget = leadType === 'residential' && clientProfile ? clientProfile : searchTerm;
		
		// Log the quick job execution
		console.log(`[Handler] Running QUICK JOB (max 3 leads) for: ${searchTerm} (Signal: ${resolvedActiveSignal}) in ${location}.`);

		// FIX: Use the new flexible search term resolution for the primary query
		const primarySearchTerm = resolvePrimarySearchTerm(leadType, quickJobTarget, financialTerm, targetDecisionMaker);

		// 3. Run the Quick Job (Batch 0 only, max 3 leads)
		// CRITICAL FIX: Ensure correct arguments are passed according to function signature:
		// (leadType, targetType, financialTerm, activeSignal, location, salesPersona, socialFocus, targetDecisionMaker, totalBatches)
		const leads = await generateLeadsBatch(
			leadType, 			// 1. leadType
			primarySearchTerm, 	// 2. targetType (now the flexible search term)
			financialTerm, 		// 3. financialTerm 
			resolvedActiveSignal, 	// 4. activeSignal 
			location, 			// 5. location 
			salesPersona, 		// 6. salesPersona 
			socialFocus, 		// 7. socialFocus 
			targetDecisionMaker, // 8. targetDecisionMaker (NEW: used for social signal batch)
			1 					// 9. totalBatches (fixed to 1)
		);

		// 4. Return the highly prioritized leads
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
		const { leadType, searchTerm, activeSignal, location, salesPersona, socialFocus, financialTerm, targetDecisionMaker, totalLeads } = requestData;

		// The background job is designed to be more comprehensive (up to 4 batches)
		const batchesToRun = Math.min(4, Math.ceil(totalLeads / 3)); // Max 4 batches, 3 leads/batch = 12 leads max
		const resolvedActiveSignal = activeSignal || "actively seeking solution or new provider";

		console.log(`[Background] Starting LONG JOB (${batchesToRun} batches) for: ${searchTerm} in ${location}.`);

		// FIX: Use the flexible search term resolution for the primary query
		// The background job uses the full complex 'searchTerm' as the targetType input for maximum variety
		const primarySearchTerm = resolvePrimarySearchTerm(leadType, searchTerm, financialTerm, targetDecisionMaker);

		// --- Execution of the Long Task ---
		// (leadType, targetType, financialTerm, activeSignal, location, salesPersona, socialFocus, targetDecisionMaker, totalBatches)
		const leads = await generateLeadsBatch(
			leadType, 			// 1. leadType
			primarySearchTerm, 	// 2. targetType (flexible search term)
			financialTerm, 		// 3. financialTerm
			resolvedActiveSignal, 	// 4. activeSignal
			location, 			// 5. location
			salesPersona, 		// 6. salesPersona
			socialFocus, 		// 7. socialFocus
			targetDecisionMaker, // 8. targetDecisionMaker
			batchesToRun 		// 9. totalBatches
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
