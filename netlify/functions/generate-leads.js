/**
 * Ultimate Premium Lead Generator – Gemini + Google Custom Search
 *
 * This file contains two exports:
 * 1. exports.handler: Synchronous endpoint (guaranteed fast, max 3 leads).
 * 2. exports.background: Asynchronous endpoint (runs up to 15 minutes, unlimited leads).
 *
 * CRITICAL SPEED FIX APPLIED:
 * 1. FIX: The synchronous job (Batch 0) now uses the 'shortTargetType' (simplified search term) instead of the long, complex 'searchTerm'.
 * 2. ENHANCEMENT: The 'simplifySearchTerm' logic is improved to strip parenthetical notes and conjunctions (AND/OR) to produce a cleaner, faster search query, minimizing 503/timeouts.
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
// Enrichment & Quality Helpers
// -------------------------
const PLACEHOLDER_DOMAINS = ['example.com', 'placeholder.net', 'null.com', 'test.com'];

/**
 * Checks if a website is responsive using a head request (fastest check).
 * @param {string} url 
 * @returns {boolean} True if the website responds without major errors.
 */
async function checkWebsiteStatus(url) {
	// Basic validation to prevent invalid URL usage
	if (!url || !url.startsWith('http')) return false; 
	try {
		// Use HEAD request for speed, timeout short for validation (5 seconds)
		// Set maxRetries to 1 (meaning no retries) for a fast validation check
		const response = await withBackoff(() => fetchWithTimeout(url, { method: 'HEAD' }, 5000), 1, 500); 
		// We consider 2xx (Success) and 3xx (Redirection) as valid.
		return response.ok || (response.status >= 300 && response.status < 400); 
	} catch (e) {
		console.warn(`Website check failed for ${url}: ${e.message}`);
		return false;
	}
}


/**
 * Generates a realistic email pattern based on name and website.
 */
async function enrichEmail(lead, website) {
	try {
		const url = new URL(website);
		const domain = url.hostname;
		
		// Use contactName if available and it's a residential lead
		const nameToUse = lead.leadType === 'residential' && lead.contactName ? lead.contactName : lead.name;
		
		const nameParts = nameToUse.toLowerCase().split(' ').filter(part => part.length > 0);
		
		if (nameParts.length < 2) {
			 // If we don't have enough parts for first.last, use generic fallback
			 return `info@${domain}`;
		}
		
		const firstName = nameParts[0];
		const lastName = nameParts[nameParts.length - 1];

		// Define common email patterns, starting with the most professional one
		const patterns = [
			`${firstName}.${lastName}@${domain}`, 	 	// John.doe@example.com (Primary)
			`${firstName}_${lastName}@${domain}`, 	 	// John_doe@example.com
			`${firstName.charAt(0)}${lastName}@${domain}`, // Jdoe@example.com
			`${firstName}@${domain}`, 	 	 	 	// John@example.com
			`info@${domain}`, 	 	 	 	 	// Info@example.com (Fallback generic)
		].filter(p => !p.includes('undefined')); // Remove patterns if name parts are missing

		// Use the first valid pattern for consistency (Highest confidence guess)
		if (patterns.length > 0) {
			return patterns[0].replace(/\s/g, '');
		}
		
		// Fallback to a generic domain contact if name processing fails
		return `contact@${website.replace(/^https?:\/\//, '').split('/')[0]}`;
	} catch (e) {
		console.error("Email enrichment error:", e.message);
		// Fallback if URL parsing fails completely, using website string directly
		return `contact@${website.replace(/^https?:\/\//, '').split('/')[0]}`;
	}
}

/**
 * Phone number enrichment is disabled. The number must be extracted by Gemini or remain null.
 */
async function enrichPhoneNumber(currentNumber) {
	// If a number was found and is not a known placeholder, keep it.
	if (currentNumber && currentNumber.length > 5 && !currentNumber.includes('555')) {
		return currentNumber;
	}
	// Otherwise, return null to signify missing data.
	return null;	
}

/**
 * Calculates a match score between the lead's description/insights and the sales persona.
 * NOTE: This relies on the core 'persona' keywords previously defined.
 */
function calculatePersonaMatchScore(lead, salesPersona) {
	// Simple scoring based on general financial and commercial terms, since specific persona keywords are removed.
	if (!lead.description && !lead.insights) return 0;
	
	let score = 0;
	const text = (lead.description + ' ' + (lead.insights || '')).toLowerCase();
	
	// Use simplified keyword matching based on the persona type for B2B/B2C focus
	if (salesPersona.includes('insurance') || salesPersona.includes('financial') || salesPersona.includes('mortgage')) {
		if (text.includes('wealth') || text.includes('invest') || text.includes('plan') || text.includes('policy')) score += 1;
	}
	if (lead.leadType === 'commercial') {
		if (text.includes('business') || text.includes('owner') || text.includes('hiring') || text.includes('expansion')) score += 1;
	}
	if (lead.leadType === 'residential') {
		if (text.includes('home') || text.includes('family') || text.includes('move') || text.includes('individual')) score += 1;
	}
	
	return Math.min(score, 5); // Cap score at 5 for a consistent weighting
}


function computeQualityScore(lead) {
	// Score based on existence of contact info (email must be non-placeholder)
	const hasValidEmail = lead.email && lead.email.includes('@') && !PLACEHOLDER_DOMAINS.some(domain => lead.email.includes(domain));
	const hasPhone = !!lead.phoneNumber;	
	
	if (hasValidEmail && hasPhone) return 'High';
	if (hasValidEmail || hasPhone) return 'Medium';
	return 'Low';
}

async function generatePremiumInsights(lead) {
	// Placeholder fallback if Gemini misses the social signal
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
			// Add weight for the new specialized fields (High Intent Focus)
			if (l.transactionStage && l.keyPainPoint) score += 2;
			else if (l.transactionStage || l.keyPainPoint) score += 1;
			if (l.socialSignal) score += 1; 

			// Add Persona Match Score (Max 5 points)
			score += l.personaMatchScore || 0;	
			
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

/**
 * NEW: Concurrent processing of a single lead, including non-blocking network checks.
 */
async function enrichAndScoreLead(lead, leadType, salesPersona) {
	// Assign leadType and salesPersona for use in the NEW scoring functions
	lead.leadType = leadType;	
	lead.salesPersona = salesPersona;

	// 1. Clean up website protocol
	if (lead.website && !lead.website.includes('http')) {
		lead.website = 'https://' + lead.website.replace(/https?:\/\//, '');
	}
	
	let websiteIsValid = false;
	if (lead.website) {
		websiteIsValid = await checkWebsiteStatus(lead.website);
	}

	// 2. Validate and enrich contact info
	if (lead.website && !websiteIsValid) {
		console.warn(`Lead ${lead.name} website failed validation. Skipping email enrichment.`);
		// Clear website if it's dead, preventing failed URL parsing later
		lead.website = null;	
	}

	const shouldEnrichEmail = !lead.email || PLACEHOLDER_DOMAINS.some(domain => lead.email.includes(domain));
	
	lead.phoneNumber = await enrichPhoneNumber(lead.phoneNumber);

	if (shouldEnrichEmail && lead.website) {	
		lead.email = await enrichEmail(lead, lead.website);
	} else if (!lead.website) {
		 lead.email = null; 
	}

	// 3. Scoring
	lead.personaMatchScore = calculatePersonaMatchScore(lead, salesPersona);
	lead.qualityScore = computeQualityScore(lead);
	
	// 4. Fallback for social signal (should only happen if Gemini missed it)
	if (!lead.socialSignal) {
		lead.socialSignal = await generatePremiumInsights(lead);
	}
	
	// 5. Ensure socialMediaLinks is always an array
	if (!Array.isArray(lead.socialMediaLinks)) {
		 lead.socialMediaLinks = lead.socialMediaLinks ? [lead.socialMediaLinks] : [];
	}

	return lead;
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
// Keyword Definitions (SIMPLIFIED and CONSOLIDATED)
// -------------------------

// Single list of powerful, cross-industry intent signals
const HIGH_INTENT_SIGNALS = [
	// Financial/Transactional signals
	`"pre-approved" OR "comparing rates" OR "finalizing deal" OR "securing funding"`, 
	// Competitive/Shopping signals
	`"need new vendor" OR "shopping around" OR "reviewing bids" OR "asking for quotes"`, 
	// Time-sensitive/Growth signals
	`"new construction" OR "business expansion" OR "urgent need" OR "new hiring"`, 
	// Liquidity/Asset signals
	`"high net worth" OR "annuity maturing" OR "recent major purchase" OR "trust fund established"`
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
 * Aggressively simplifies a complex search term into core search keywords for broad coverage.
 * CRITICAL ENHANCEMENT: Strips parenthetical clutter and conjunctions.
 */
function simplifySearchTerm(targetType, isResidential) {
	// 1. Remove parenthetical descriptions and 'AND'/'OR' for simplicity
	let core = targetType
		.replace(/\([^)]*\)/g, '') // Remove (everything inside parenthesis)
		.replace(/\s+AND\s+/gi, ' ') // Remove AND
		.replace(/\s+OR\s+/gi, ' ') // Remove OR
		.trim();

	// 2. Normalize and split, filtering out short, common words (like 'for', 'the', 'a')
	const words = core.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !['seeking', 'targeting', 'new', 'owner', 'key'].includes(w)); 

	// 3. Keep the 4 most relevant words/phrases
	const targetWords = words.slice(0, 4);

	// 4. Wrap each in quotes if they are separate words for better search focus
	if (targetWords.length > 1) {
		return targetWords.map(w => `"${w}"`).join(' ');
	}
	
	// Fallback to cleaned core term
	return core; 
}


// -------------------------
// Lead Generator Core (SIMPLIFIED CONCURRENT EXECUTION)
// -------------------------
async function generateLeadsBatch(leadType, targetType, activeSignal, location, salesPersona, socialFocus, totalBatches = 3) {
	
	const template = leadType === 'residential'
		? "Focus on individual homeowners, financial capacity, recent property activities."
		: "Focus on businesses, size, industry relevance, recent developments.";

	// System Instruction remains rich, as it guides the LLM on quality
	const systemInstruction = `You are an expert Lead Generation analyst using the provided data.
You MUST follow the JSON schema provided in the generation config.
CRITICAL: All information MUST pertain to the lead referenced in the search results.

**B2C CONTACT ENHANCEMENT**: If the 'leadType' is 'residential' and the search snippets imply an individual, you MUST infer a realistic, full first and last name and populate the **'contactName'** field. If a business is implied, leave it blank.

Email: When fabricating an address (e.g., contact@domain.com), you MUST use a domain from the provided 'website' field. NEVER use placeholder domains.
Phone Number: You MUST extract the phone number directly from the search snippets provided. IF A PHONE NUMBER IS NOT PRESENT IN THE SNIPPETS, YOU MUST LEAVE THE 'phoneNumber' FIELD COMPLETELY BLANK (""). DO NOT FABRICATE A PHONE NUMBER.
High-Intent Metrics: You MUST infer and populate both 'transactionStage' (e.g., "Active Bidding", "Comparing Quotes") and 'keyPainPoint' based on the search snippets to give the user maximum outreach preparation. You MUST also use the search results to infer and summarize any **competitive shopping signals, recent social media discussions, or current events** in the 'socialSignal' field.
Geographical Detail: Based on the search snippet and the known location, you MUST infer and populate the 'geoDetail' field with the specific neighborhood, street name, or zip code mentioned for that lead. If none is found, return the general location provided.`;

	const isResidential = leadType === 'residential';
	const batchPromises = [];
	
	// Calculate simplified term once for use in all batches to ensure speed and consistency
	const shortTargetType = simplifySearchTerm(targetType, isResidential); 

	// --- Create ALL Promises Concurrently (Max 3 Batches) ---
	for (let i = 0; i < totalBatches; i++) {
		
		const batchPromise = (async (batchIndex) => {
			let searchKeywords;
			
			if (batchIndex === 0) {
				// BATCH 0: PRIMARY INTENT SEARCH (Highest Quality / QUICK JOB)
				// CRITICAL FIX: Use the simplified term (shortTargetType) for speed and reliability.
				const intentSignal = HIGH_INTENT_SIGNALS[0]; 
				console.log(`[Batch 1] Running PRIMARY Intent Query (Simplified Term + High Signal).`);
				searchKeywords = `(${shortTargetType}) in "${location}" AND (${intentSignal}) ${NEGATIVE_QUERY}`;
				
			} else if (batchIndex === 1) {
				// BATCH 1: BROAD COVERAGE SEARCH (Guaranteed Results/Fallback)
				// Uses the simplified 'shortTargetType' + the user's activeSignal. This provides a safety net.
				console.log(`[Batch 2] Running BROAD COVERAGE Query (Simplified Term + Active Signal).`);
				searchKeywords = `(${shortTargetType}) in "${location}" AND (${activeSignal}) ${NEGATIVE_QUERY}`;

			} else if (batchIndex === 2) { 
				// BATCH 2: DEDICATED SOCIAL/COMPETITIVE INTENT (Hot Leads)
				// Targets social/forum sites specifically for competitive shopping signals.
				const socialTerms = socialFocus && socialFocus.trim().length > 0 ? socialFocus.trim() : `"shopping around" OR "need new provider"`;
				searchKeywords = `site:linkedin.com OR site:facebook.com OR site:twitter.com (${shortTargetType}) in "${location}" AND (${socialTerms}) ${NEGATIVE_QUERY}`;
				console.log(`[Batch 3] Running dedicated Social/Competitive Intent Query (HOT Signal).`);
			} else {
				// Should not happen if totalBatches is correctly limited, but as a guard:
				return [];
			}
			
			// 1. Get verified search results (Fail-fast enforced inside googleSearch)
			let gSearchResults = await googleSearch(searchKeywords, 3);	
			
			// If the high-intent searches (0 or 2) fail, fall back to the broadest search possible
			if (gSearchResults.length === 0 && batchIndex !== 1) {
				console.warn(`[Batch ${batchIndex+1}] No results for high-intent query. Trying generic term fallback...`);
				
				// Fallback: Drop ALL signals and just search the simplified core term and location.
				let fallbackSearchKeywords = `${shortTargetType} in "${location}" ${NEGATIVE_QUERY}`;
				
				const fallbackResults = await googleSearch(fallbackSearchKeywords, 3);	
				gSearchResults.push(...fallbackResults);

				if (gSearchResults.length === 0) {
					 console.warn(`[Batch ${batchIndex+1}] No results after broadest fallback. Skipping batch.`);
					 return [];
				}
			}	

			// 2. Feed results to Gemini for qualification
			const geminiQuery = `Generate 3 high-quality leads for a ${leadType} audience, with a focus on: "${template}". The primary query is "${targetType}" in "${location}". Base your leads strictly on these search results: ${JSON.stringify(gSearchResults)}`;

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
	
	// CRITICAL FIX: Run the enrichment and scoring *concurrently*
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
		console.log(`[Handler DEBUG] Raw Event Body: ${event.body}`);
		requestData = JSON.parse(event.body);
		console.log('[Handler DEBUG] Parsed Body Data:', requestData);

		const { leadType, searchTerm, activeSignal, location, salesPersona, socialFocus } = requestData;
		
		const resolvedActiveSignal = activeSignal || "actively seeking solution or new provider";

		if (!leadType || !searchTerm || !location || !salesPersona) {
			 const missingFields = ['leadType', 'searchTerm', 'location', 'salesPersona'].filter(field => !requestData[field]);
			 
			 if (!resolvedActiveSignal) missingFields.push('activeSignal');	

			 console.error(`[Handler] Missing fields detected: ${missingFields.join(', ')}`);
			 
			 return {	
				 statusCode: 400,	
				 headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
				 body: JSON.stringify({ error: `Missing required parameters: ${missingFields.join(', ')}` })	
			 };
		}

		// CRITICAL: Hard limit the synchronous job to 1 batch (Batch 0: Primary Intent Search).
		const batchesToRun = 1;	
		const requiredLeads = 3;

		console.log(`[Handler] Running QUICK JOB (max 3 leads) for: ${searchTerm} (Signal: ${resolvedActiveSignal}) in ${location}.`);

		const leads = await generateLeadsBatch(leadType, searchTerm, resolvedActiveSignal, location, salesPersona, socialFocus, batchesToRun);
		
		return {
			statusCode: 200,
			headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
			body: JSON.stringify({ leads: leads.slice(0, requiredLeads), count: leads.slice(0, requiredLeads).length })
		};
	} catch (err) {
		if (err.name === 'SyntaxError') {
			 console.error('Lead Generator Handler Error: Failed to parse JSON body.', err.message);
			 return {	
				 statusCode: 400,	
				 headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
				 body: JSON.stringify({ error: 'Invalid JSON request body provided.' })	
			 };
		}
		
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
		const requestData = JSON.parse(event.body);
		const { leadType, searchTerm, activeSignal, location, salesPersona, socialFocus } = requestData;

		const resolvedActiveSignal = activeSignal || "actively seeking solution or new provider";

		if (!leadType || !searchTerm || !location || !salesPersona) {
			console.error('[Background] Missing required fields in request.');
			return {	
				statusCode: 400,	
				headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
				body: JSON.stringify({ error: 'Missing required parameters for background job.' })	
			};
		}
		
		// Set the background job to run the 3 high-value search batches.
		const batchesToRun = 3; 

		console.log(`[Background] Starting LONG JOB (${batchesToRun} batches) for: ${searchTerm} in ${location}.`);

		const leads = await generateLeadsBatch(leadType, searchTerm, resolvedActiveSignal, location, salesPersona, socialFocus, batchesToRun);
		
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
			body: JSON.stringify({ error: err.message, details: err.cause || 'No cause provided', status: 'failed' })	
		};
	}
};
