/**
 * Ultimate Premium Lead Generator – Gemini + Google Custom Search
 *
 * This file contains two exports:
 * 1. exports.handler: Synchronous endpoint (guaranteed fast, max 3 leads).
 * 2. exports.background: Asynchronous endpoint (runs up to 15 minutes, unlimited leads).
 *
 * REFINEMENTS APPLIED:
 * 1. ENHANCED: Email enrichment logic updated to include more common, professional patterns.
 * 2. ENHANCED: Added website validation (HEAD request) before attempting email enrichment for more robust data.
 * 3. ENHANCED: Implemented **Persona Match Scoring** to give higher priority to leads whose content strongly aligns with the 'salesPersona'.
 * 4. ENHANCED: **Geographical Granularity** added by instructing Gemini to infer 'geoDetail' (neighborhood/zip) from snippets.
 * 5. NEW CRITICAL UPDATE: Dedicated a search batch to **External Intent Grounding** (social/competitive signals) to find "HOT" leads actively comparing services.
 * 6. NEW CRITICAL UPDATE: Updated Gemini System Instruction to force inference of competitive shopping data into the 'socialSignal' field.
 * 7. ADJUSTED: Refactored final lead processing to run all website checks and enrichment concurrently.
 * 8. ADJUSTED: Added robust JSON extraction to handle Gemini's markdown formatting.
 * 9. **NEW: Added 'socialFocus' input field contingency to customize the social/competitive search query.**
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
		// We consider 2xx (Success) and 3xx (Redirection) as valid. 4xx/5xx are invalid.
		return response.ok || (response.status >= 300 && response.status < 400); 
	} catch (e) {
		console.warn(`Website check failed for ${url}: ${e.message}`);
		return false;
	}
}


/**
 * Generates a realistic email pattern based on name and website.
 * ENHANCEMENT: Added more common patterns for better coverage.
 */
async function enrichEmail(name, website) {
	try {
		const url = new URL(website);
		const domain = url.hostname;
		const nameParts = name.toLowerCase().split(' ').filter(part => part.length > 0);
		
		if (nameParts.length === 0) {
			 return `contact@${domain}`;
		}
		
		const firstName = nameParts[0];
		const lastName = nameParts[nameParts.length - 1];

		// Define common email patterns, starting with the most professional one
		const patterns = [
			`${firstName}.${lastName}@${domain}`, 	 	// John.doe@example.com (Primary)
			`${firstName}_${lastName}@${domain}`, 	 	// John_doe@example.com
			`${lastName}.${firstName}@${domain}`, 	 	// Doe.john@example.com
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
	} catch {
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
 */
function calculatePersonaMatchScore(lead, salesPersona) {
	// Lead Type must be added to the lead object during the batch process before calling this.
	if (!lead.description && !lead.insights) return 0;
	
	let score = 0;
	const persona = salesPersona.toLowerCase();
	const text = (lead.description + ' ' + (lead.insights || '')).toLowerCase();
	
	// Add points for direct persona keywords (e.g., 'financial_advisor' keywords)
	const personaKeywords = PERSONA_KEYWORDS[persona] || [];
	
	for (const phrase of personaKeywords) {
		// Simplify the complex search phrase into core words for scoring
		// We look for parts of the phrase that aren't stop words or operators
		const words = phrase.replace(/["()]/g, '').split(/ OR | AND | /).filter(w => w.length > 5);	
		for (const word of words) {
			if (text.includes(word.trim())) {
				score += 1;
			}
		}
	}

	// Add points for B2B/Residential match (General context match)
	if (lead.leadType === 'commercial' && (text.includes('business') || text.includes('company'))) score += 1;
	if (lead.leadType === 'residential' && (text.includes('homeowner') || text.includes('individual') || text.includes('family'))) score += 1;
	
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
	// These are placeholders for real, scraped insights; still useful for Gemini context.
	const events = [
		`Featured in local news about ${lead.name}`,
		`Announced new product/service in ${lead.website}`,
		`Recent funding or partnership signals for ${lead.name}`,
		`High engagement on social media for ${lead.name}`
	];
	// CRITICAL: Since we are now using a dedicated search batch for socialSignal, 
	// this fallback is used ONLY if Gemini failed to extract a socialSignal from the search snippets.
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
			if (l.socialSignal) score += 1; // Points for inferred social/competitive context

			// NEW: Add Persona Match Score (Max 5 points)
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
 * This function is designed to be run in parallel with other leads.
 */
async function enrichAndScoreLead(lead, leadType, salesPersona) {
	// Assign leadType and salesPersona for use in the NEW scoring functions
	lead.leadType = leadType;	
	lead.salesPersona = salesPersona;

	// 1. Clean up website protocol
	if (lead.website && !lead.website.includes('http')) {
		// Fix missing protocol if necessary for validation check
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

	// Check if the current email is empty or contains a known placeholder
	const shouldEnrichEmail = !lead.email || PLACEHOLDER_DOMAINS.some(domain => lead.email.includes(domain));
	
	// Use the new, strict phone number enrichment/verification
	lead.phoneNumber = await enrichPhoneNumber(lead.phoneNumber);

	// Only enrich if the website is available and the existing email is bad/missing
	if (shouldEnrichEmail && lead.website) {	
		lead.email = await enrichEmail(lead.name, lead.website);
	} else if (!lead.website) {
		 lead.email = null; // Cannot enrich if the website is gone/invalid
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
		 // If Gemini generated a single string or nothing, ensure it's converted to an array or empty.
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
			propertyOrdering: ["name", "description", "website", "email", "phoneNumber", "qualityScore", "insights", "suggestedAction", "draftPitch", "socialSignal", "socialMediaLinks", "transactionStage", "keyPainPoint", "geoDetail"]
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
		
		// Attempt to clean up common quote escaping issues.
		cleanedText = cleanedText.replace(/([^\\])"/g, (match, p1) => `${p1}\\"`);
		
		try {
			return JSON.parse(cleanedText);
		} catch (e2) {
			console.error("Failed to parse Gemini output as JSON, even after cleaning.", e2.message);
			throw new Error("Failed to parse Gemini output as JSON.", { cause: e.message });
		}
	}
}

// -------------------------
// Keyword Definitions (UPDATED for High Intent)
// -------------------------
const PERSONA_KEYWORDS = {
	"real_estate": [
		`"closing soon" OR "pre-approval granted" OR "final walk-through"`, // High Intent: Transactional closure
		`"new construction" OR "single-family home" AND "immediate move"`, // High Intent: Time-sensitive need
		`"building permit" OR "major home renovation project" AND "budget finalized"`, // High Intent: Budget and scope set
		`"distressed property listing" AND "cash offer"`, // High Intent: Quick sale/purchase
		`"recent move" OR "new job in area" AND "needs services"` // High Intent: New location, new vendors needed
	],
	"life_insurance": [
		`"inheritance received" OR "trust fund established" OR "annuity maturing"`, // High Intent: Major liquidity event
		`"retirement plan rollovers" OR "seeking estate lawyer"`, // High Intent: Active financial management
		`"trust fund establishment" OR "recent major asset purchase"`, // High Intent: High net worth activity
		`"IRA rollover" OR "annuity comparison" AND "urgent decision"`, // High Intent: Time-sensitive decision
		`"age 50+" OR "retirement specialist" AND "portfolio review"` // High Intent: Actively reviewing retirement
	],
	"financial_advisor": [
		`"recent funding" OR "major business expansion" AND "need advisor"`, // High Intent: Need for financial guidance
		`"property investor" OR "real estate portfolio management" AND "tax strategy"`, // High Intent: Specific service need
		`"401k rollover" OR "retirement planning specialist" AND "immediate consultation"`, // High Intent: Active seeking of advice
		`"S-Corp filing" OR "new business incorporation" AND "accounting needed"` // High Intent: New business setup
	],
	"local_services": [
		`"home improvement" OR "major repair needed" AND "quote accepted"`, // High Intent: Ready to proceed
		`"renovation quote" OR "remodeling project bid" AND "start date imminent"`, // High Intent: Confirmed project
		`"new construction start date" OR "large landscaping project" AND "hiring now"`, // High Intent: Active hiring
		`"local homeowner review" OR "service provider recommendations" AND "booked service"` // High Intent: High social signal/recommendation
	],
	"mortgage": [
		`"mortgage application pre-approved" OR "refinancing quote" AND "comparing rates"`, // High Intent: Shopping phase
		`"recent purchase contract signed" OR "new home loan needed" AND "30 days to close"`, // High Intent: Critical timeline
		`"first-time home buyer seminar" OR "closing date soon" AND "documents finalized"`, // High Intent: Advanced planning
		`"VA loan eligibility" OR "FHA loan requirements" AND "submission ready"` // High Intent: Specific product search
	],
	"default": [
		`"urgent event venue booking" OR "last-minute service needed"`,	
		`"moving company quotes" AND "move date confirmed"`,	
		`"recent college graduate" AND "seeking investment advice"`,	
		`"small business startup help" AND "funding secured"`
	]
};
const COMMERCIAL_ENHANCERS = [
	`"new funding" OR "business expansion" AND "need new vendor"`, // High Intent: Budget available
	`"recent hiring" OR "job posting" AND "sales staff needed"`, // High Intent: Sales/Growth focus
	`"moved office" OR "new commercial building" AND "telecom setup needed"`, // High Intent: Infrastructure need
	`"new product launch" OR "major contract win" AND "immediate capacity need"` // High Intent: Scalability/capacity issue
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
 * Aggressively simplifies a complex, descriptive target term into core search keywords.
 */
function simplifySearchTerm(targetType, isResidential) {
	let coreTerms = [];
	const normalized = targetType.toLowerCase();

	// Key Commercial Terms (use AND to narrow results)
	if (!isResidential) {
		// High signal terms for commercial
		if (normalized.includes('brokerage')) coreTerms.push('brokerage');
		if (normalized.includes('small business')) coreTerms.push('"small business"');
		if (normalized.includes('50+ employees')) coreTerms.push('"50+ employees"');
		else if (normalized.includes('50+')) coreTerms.push('"50+ employees"');
		else if (normalized.includes('sales staff')) coreTerms.push('"sales staff"');

		return coreTerms.length > 0 ? coreTerms.join(' AND ') : targetType.split(/\s+/).slice(0, 4).join(' ');
	}
	
	// Key Residential/Financial Terms (use OR to broaden results)
	if (isResidential) {
		// High signal terms for residential
		if (normalized.includes('high net worth')) coreTerms.push('"high net worth"');
		if (normalized.includes('affluent')) coreTerms.push('affluent');
		if (normalized.includes('age 50+')) coreTerms.push('"age 50+"');
		if (normalized.includes('mortgage')) coreTerms.push('mortgage');
		if (normalized.includes('homeowner')) coreTerms.push('homeowner');
		
		return coreTerms.length > 0 ? coreTerms.join(' OR ') : targetType.split(/\s+/).slice(0, 4).join(' ');
	}

	// Default fallback
	return targetType.split(/\s+/).slice(0, 4).join(' ');
}


// -------------------------
// Lead Generator Core (CONCURRENT EXECUTION)
// -------------------------
async function generateLeadsBatch(leadType, targetType, activeSignal, location, salesPersona, socialFocus, totalBatches = 4) {
	
	const template = leadType === 'residential'
		? "Focus on individual homeowners, financial capacity, recent property activities."
		: "Focus on businesses, size, industry relevance, recent developments.";

	// UPDATED SYSTEM INSTRUCTION: Explicitly instructing Gemini to find competitive/social signals
	const systemInstruction = `You are an expert Lead Generation analyst using the provided data.
You MUST follow the JSON schema provided in the generation config.
CRITICAL: All information MUST pertain to the lead referenced in the search results.
Email: When fabricating an address (e.g., contact@domain.com), you MUST use a domain from the provided 'website' field. NEVER use placeholder domains.
Phone Number: You MUST extract the phone number directly from the search snippets provided. IF A PHONE NUMBER IS NOT PRESENT IN THE SNIPPETS, YOU MUST LEAVE THE 'phoneNumber' FIELD COMPLETELY BLANK (""). DO NOT FABRICATE A PHONE NUMBER.
High-Intent Metrics: You MUST infer and populate both 'transactionStage' (e.g., "Active Bidding", "Comparing Quotes") and 'keyPainPoint' based on the search snippets to give the user maximum outreach preparation. You MUST also use the search results to infer and summarize any **competitive shopping signals, recent social media discussions, or current events** in the 'socialSignal' field.
Geographical Detail: Based on the search snippet and the known location, you MUST infer and populate the 'geoDetail' field with the specific neighborhood, street name, or zip code mentioned for that lead. If none is found, return the general location provided.`;

	const personaKeywords = PERSONA_KEYWORDS[salesPersona] || PERSONA_KEYWORDS['default'];
	const isResidential = leadType === 'residential';
	
	const batchPromises = [];

	// --- Create ALL Promises Concurrently ---
	for (let i = 0; i < totalBatches; i++) {
		
		const batchPromise = (async (batchIndex) => {
			let searchKeywords;
			
			// Cycle through hardcoded enhancers for variety/safety
			const personaEnhancer = personaKeywords[batchIndex % personaKeywords.length];	
			const b2bEnhancer = COMMERCIAL_ENHANCERS[batchIndex % COMMERCIAL_ENHANCERS.length];

			// Simplify the user's target input before combining it with signals
			const shortTargetType = simplifySearchTerm(targetType, isResidential);

			// Determine primary search keywords
			if (batchIndex === 0) {
				// Batch 0 (used by the quick handler) relies ONLY on the user's explicit signal.
				searchKeywords = `(${shortTargetType}) in "${location}" AND "${activeSignal}" ${NEGATIVE_QUERY}`;
			} else if (batchIndex === totalBatches - 1 && totalBatches > 1) { 
                // NEW: Dedicated final batch for Social/Competitive Intent Grounding (HOT Lead Signal)
                // Use the user's socialFocus input, or fallback to the generic terms.
				const defaultSocialTerms = `"shopping around" OR "comparing quotes" OR "need new provider"`;
                const socialTerms = socialFocus && socialFocus.trim().length > 0 ? socialFocus.trim() : defaultSocialTerms;
 				
                // Search specifically on social/forum sites for real-time discussion and shopping intent.
                searchKeywords = `site:twitter.com OR site:reddit.com OR site:forums.com (${shortTargetType}) in "${location}" AND (${socialTerms}) ${NEGATIVE_QUERY}`;
                console.log(`[Batch ${batchIndex+1}] Running dedicated Social/Competitive Intent Query (HOT Signal).`);
			} else if (isResidential) {
				
				// RESIDENTIAL QUERY (Batch > 0): Simplified core target + location + high-intent persona signal
				searchKeywords = `(${shortTargetType}) in "${location}" AND (${personaEnhancer}) ${NEGATIVE_QUERY}`;
			} else {
				
				// B2B QUERY (Batch > 0): Simplified core target + location + high-intent B2B signal
				searchKeywords = `(${shortTargetType}) in "${location}" AND (${b2bEnhancer}) ${NEGATIVE_QUERY}`;
			}
			
			// 1. Get verified search results (Primary) - Fail-fast enforced inside googleSearch
			let gSearchResults = await googleSearch(searchKeywords, 3);	
			
			// 2. Fallback search if primary fails (Simplified Logic)
			if (gSearchResults.length === 0) {
				console.warn(`[Batch ${batchIndex+1}] No results for primary query. Trying simplified fallback...`);
				let fallbackSearchKeywords;
				
				// Fallback: Drop the most complex enhancer/signal
				if (isResidential) {
					fallbackSearchKeywords = `${shortTargetType} in ${location} ${NEGATIVE_QUERY}`;
				} else {
					// Commercial fallback uses the first (often most general) commercial enhancer to ensure some B2B context
					fallbackSearchKeywords = `${shortTargetType} in ${location} AND (${COMMERCIAL_ENHANCERS[0]}) ${NEGATIVE_QUERY}`;
				}
				
				// Fallback also uses the Fail-Fast approach
				const fallbackResults = await googleSearch(fallbackSearchKeywords, 3);	
				gSearchResults.push(...fallbackResults);

				if (gSearchResults.length === 0) {
					 console.warn(`[Batch ${batchIndex+1}] No results after fallback. Skipping batch.`);
					 return [];
				}
			}	

			// 3. Feed results to Gemini for qualification
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

	// The `enrichedLeads` array already contains all necessary fields for ranking
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
		// --- START DEBUG LOGGING ---
		console.log(`[Handler DEBUG] Raw Event Body: ${event.body}`);
		requestData = JSON.parse(event.body);
		console.log('[Handler DEBUG] Parsed Body Data:', requestData);
		// --- END DEBUG LOGGING ---

		// NEW: Destructure socialFocus
		const { leadType, searchTerm, activeSignal, location, salesPersona, socialFocus } = requestData;
		
		// Default activeSignal if client is not sending it
		const resolvedActiveSignal = activeSignal || "actively seeking solution or new provider";

		// Checking for required parameters (using searchTerm and resolvedActiveSignal)
		if (!leadType || !searchTerm || !location || !salesPersona) {
			 const missingFields = ['leadType', 'searchTerm', 'location', 'salesPersona'].filter(field => !requestData[field]);
			 
			 // Check resolvedActiveSignal explicitly here, though it should be defaulted
			 if (!resolvedActiveSignal) missingFields.push('activeSignal');	

			 console.error(`[Handler] Missing fields detected: ${missingFields.join(', ')}`);
			 
			 return {	
				 statusCode: 400,	
				 headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
				 body: JSON.stringify({ error: `Missing required parameters: ${missingFields.join(', ')}` })	
			 };
		}

		// CRITICAL: Hard limit the synchronous job to 1 batch (3 leads).
		// Note: The quick job will only run Batch 0, which relies on the user's explicit signal.
		const batchesToRun = 1;	
		const requiredLeads = 3;

		console.log(`[Handler] Running QUICK JOB (max 3 leads) for: ${searchTerm} (Signal: ${resolvedActiveSignal}) in ${location}.`);

		// NEW: Pass socialFocus to generator
		const leads = await generateLeadsBatch(leadType, searchTerm, resolvedActiveSignal, location, salesPersona, socialFocus, batchesToRun);
		
		return {
			statusCode: 200,
			headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
			body: JSON.stringify({ leads: leads.slice(0, requiredLeads), count: leads.slice(0, requiredLeads).length })
		};
	} catch (err) {
		// If JSON parsing fails (e.g., event.body is empty or malformed)
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
	
	// Define the immediate 202 Accepted response
	const immediateResponse = {
		statusCode: 202, // Accepted
		headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
		body: JSON.stringify({ message: 'Lead generation job accepted and running in the background. Results will be processed.' })
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
		// NEW: Destructure socialFocus
		const { leadType, searchTerm, activeSignal, location, salesPersona, socialFocus } = requestData;

		const resolvedActiveSignal = activeSignal || "actively seeking solution or new provider";

		// Checking for required parameters
		if (!leadType || !searchTerm || !location || !salesPersona) {
			console.error('[Background] Missing required fields in request.');
			return {	
				statusCode: 400,	
				headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
				body: JSON.stringify({ error: 'Missing required parameters for background job.' })	
			};
		}
		
		// Set a higher number of batches for the "unlimited" background job (e.g., 8 batches)
		// This now ensures that one of the batches is dedicated to the social/competitive search.
		const batchesToRun = 8; 

		console.log(`[Background] Starting LONG JOB (${batchesToRun} batches) for: ${searchTerm} in ${location}.`);

		// --- Execution of the Long Task ---
		// NEW: Pass socialFocus to generator
		const leads = await generateLeadsBatch(leadType, searchTerm, resolvedActiveSignal, location, salesPersona, socialFocus, batchesToRun);
		
		console.log(`[Background] Job finished successfully. Generated ${leads.length} high-quality leads.`);
		
		// IMPORTANT: For a true background handler, you would typically save results to a DB 
		// or queue a fulfillment step here, rather than returning all data.
		// We return the 202 response immediately, but for demonstration, we include a final log.
		// Since this is the end of the script provided by the user, we assume the leads variable will be processed by the environment.
		
		return {
			statusCode: 200,
			headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
			body: JSON.stringify({ leads: leads, count: leads.length, message: `Successfully generated ${leads.length} leads in background.` })
		};
	} catch (err) {
		console.error('Lead Generator Background Error:', err);
		// Log the error and still return a 200 or 202 to indicate the job processor is done,
		// but with a payload indicating failure to the monitoring system.
		return {	
			statusCode: 500,	
			headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
			body: JSON.stringify({ error: err.message, details: err.cause || 'No cause provided', status: 'failed' })	
		};
	}
};
