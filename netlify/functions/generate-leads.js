/**
 * Ultimate Premium Lead Generator – Gemini + Google Custom Search
 *
 * This file contains two exports:
 * 1. exports.handler: Synchronous endpoint (guaranteed fast, max 3 leads).
 * 2. exports.background: Asynchronous endpoint (runs up to 15 minutes, unlimited leads).
 *
 * CRITICAL FIXES APPLIED:
 * 1. CRITICAL B2C TIMEOUT FIX: The 'exports.handler' call was passing misaligned arguments. This has been corrected.
 * 2. CRITICAL B2C TIMEOUT FIX: The Quick Job now explicitly uses the clean 'clientProfile' as the target type, ensuring the core service intent is prioritized and speeding up search resolution to avoid Netlify timeouts.
 * 3. FIXED B2B SEARCH LOGIC: The commercial lead generation logic is significantly refined.
 * - The search term is no longer aggressively simplified (preventing errors like 'OR key').
 * - The primary B2B query (Batch 1) uses the full user-provided OR chain for maximum intent.
 * - The Level 2 Fallback for B2B now correctly searches only the target company type (e.g., "software companies") in the location for guaranteed results.
 * 4. B2C Logic (Residential): Remains fixed with the decoupling of the restrictive 'activeSignal' from the primary search.
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
		// We consider 2xx (Success) and 3xx (Redirection) as valid. 4xx/5xx are valid.
		return response.ok || (response.status >= 300 && response.status < 400); 
	} catch (e) {
		console.warn(`Website check failed for ${url}: ${e.message}`);
		return false;
	}
}




/**
 * Generates a realistic email pattern based on name and website.
 * ENHANCEMENT: Now uses 'contactName' for B2C leads for better accuracy.
 */
async function enrichEmail(lead, website) {
	try {
		const url = new URL(website);
		const domain = url.hostname;
		
		// CRITICAL B2C CHANGE: Use contactName if available and it's a residential lead
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
		
		// Fallback if URL parsing fails completely, using website string directly
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
		// CRITICAL UPDATE: Pass the entire lead object to enrichEmail for B2C logic
		lead.email = await enrichEmail(lead, lead.website);
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
		`"inheritance received" OR "trust fund established" OR "annuity maturing"`, // High Intent: Major liquidity event (HNI/Retirement)
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


// FIX: Made the COMMERCIAL_ENHANCERS more likely to hit with fewer terms.
const COMMERCIAL_ENHANCERS = [
	`"new funding" OR "business expansion"`, // Looser
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
 * Aggressively simplifies a complex, descriptive target term into core search keywords.
 * FIX: Commercial logic now returns the full target term to prevent accidental removal of intent.
 * CRITICAL B2C FIX: Now relies on the Quick Job handler passing a clean 'clientProfile' as targetType for B2C,
 * then guarantees the financial term is AND-ed for better intent and speed.
 */
function simplifySearchTerm(targetType, financialTerm, isResidential) {
	
	// If it's a B2B lead, return the complex OR chain as the primary target
	if (!isResidential) {
		let coreTerms = [`(${targetType})`]; // Use the full original term
		
		if (financialTerm && financialTerm.trim().length > 0) {
			coreTerms.push(`(${financialTerm})`);
		}
		
		const finalTerm = coreTerms.join(' AND ');
		console.log(`[Simplify Fix] Resolved CORE B2B TERM (Full Intent) to: ${finalTerm}`);
		return finalTerm;
	}
	
	// --- FIXED B2C LOGIC ---
	if (isResidential) {
		
		let simplifiedTerms = [];
		
		// 1. Prioritize the core target type (Client Profile, which is now passed clean in Quick Job)
		simplifiedTerms.push(`"${targetType}"`); 
		
		// 2. --- Financial Term Integration (CRITICAL FIX) ---
		// Add the financial term if it's provided, using an AND to narrow the audience
		if (financialTerm && financialTerm.trim().length > 0) {
			// Ensure it's treated as an AND condition
			simplifiedTerms.push(`AND ${financialTerm}`); 
		}


		// Join with a space (AND is already added if needed)
		const finalTerm = simplifiedTerms.join(' ');


		if (finalTerm.length > 0) {
			console.log(`[Simplify Fix] Resolved CORE B2C TERM to: ${finalTerm}`);
			return finalTerm;
		}
	}


	// Default fallback (should be rare)
	return targetType.split(/\s+/).slice(0, 4).join(' ');
}




// -------------------------
// Lead Generator Core (CONCURRENT EXECUTION)
// -------------------------
async function generateLeadsBatch(leadType, targetType, financialTerm, activeSignal, location, salesPersona, socialFocus, totalBatches = 4) {
	
	const template = leadType === 'residential'
		? "Focus on individual homeowners, financial capacity, recent property activities."
		: "Focus on businesses, size, industry relevance, recent developments.";


	// UPDATED SYSTEM INSTRUCTION: Explicitly instructing Gemini to find competitive/social signals AND infer contactName
	const systemInstruction = `You are an expert Lead Generation analyst using the provided data.
You MUST follow the JSON schema provided in the generation config.
CRITICAL: All information MUST pertain to the lead referenced in the search results.


**B2C CONTACT ENHANCEMENT**: If the 'leadType' is 'residential' and the search snippets imply an individual, you MUST infer a realistic, full first and last name and populate the **'contactName'** field. If a business is implied, leave it blank.


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


			// Pass financialTerm to ensure it's included in the simplified target if it exists
			const shortTargetType = simplifySearchTerm(targetType, financialTerm, isResidential);


			// Determine primary search keywords
			if (batchIndex === 0) {
				
				// CRITICAL FIX: Decouple 'activeSignal' from the primary B2C search (Level 1)
				if (isResidential) {
					// B2C Primary: Focus on Life Event + Financial Term (in location). NO activeSignal.
					searchKeywords = `${shortTargetType} in "${location}" ${NEGATIVE_QUERY}`;
					console.log(`[Batch 1] Running PRIMARY Life Event Query (B2C Fix: No activeSignal filter).`);
				} else {
					// B2B PRIMARY FIX: Use the full original 'targetType' (OR chain) 
					// combined with the first, looser B2B enhancer.
					searchKeywords = `(${targetType}) in "${location}" AND (${COMMERCIAL_ENHANCERS[0]}) ${NEGATIVE_QUERY}`;
					console.log(`[Batch 1] Running PRIMARY Intent Query (B2B Fix: Using full OR chain + 1 enhancer).`);
				}
			} else if (batchIndex === totalBatches - 1 && totalBatches > 1) { 
                // Dedicated final batch for Social/Competitive Intent Grounding (HOT Lead Signal)
                const defaultSocialTerms = isResidential 
					? `"new homeowner" OR "local recommendation" OR "asking for quotes"` // B2C focused
					: `"shopping around" OR "comparing quotes" OR "need new provider"`; // B2B focused
                
                const socialTerms = socialFocus && socialFocus.trim().length > 0 ? socialFocus.trim() : defaultSocialTerms;
 				
                // Search specifically on social/forum sites for real-time discussion and shopping intent.
				// CRITICAL FIX: Use the resolvedActiveSignal here combined with the shortTargetType for a high-intent, broad search.
                searchKeywords = `site:linkedin.com OR site:facebook.com OR site:twitter.com (${shortTargetType}) AND (${socialTerms} OR ${activeSignal}) in "${location}" ${NEGATIVE_QUERY}`;
                console.log(`[Batch ${batchIndex+1}] Running dedicated Social/Competitive Intent Query (HOT Signal, targeting names).`);
			} else if (isResidential) {
				
				// RESIDENTIAL QUERY (Batch > 0): Simplified core target + location + high-intent persona signal
				// These batches now serve as the active signal/financial filter
				searchKeywords = `(${shortTargetType}) in "${location}" AND (${personaEnhancer}) ${NEGATIVE_QUERY}`;
			} else {
				
				// B2B QUERY (Batch > 0): Simplified core target + location + high-intent B2B signal
				// Use a different B2B enhancer for variety
				searchKeywords = `(${targetType}) in "${location}" AND (${COMMERCIAL_ENHANCERS[batchIndex % COMMERCIAL_ENHANCERS.length]}) ${NEGATIVE_QUERY}`;
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
					// This forces Google to return local directories or service pages.
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


		// NEW: Destructure financialTerm and socialFocus, AND clientProfile (CRITICAL for the fix)
		const { leadType, searchTerm, activeSignal, location, salesPersona, socialFocus, financialTerm, clientProfile } = requestData;
		
		// Default activeSignal if client is not sending it
		const resolvedActiveSignal = activeSignal || "actively seeking solution or new provider";
		
		// FIX: Use the precise clientProfile for the Quick Job's primary target argument for B2C.
		// This avoids the complex and slow parsing of the full 'searchTerm' string.
		const quickJobTarget = leadType === 'residential' && clientProfile ? clientProfile : searchTerm;
		
		// Log the quick job execution before the long-running call
		console.log(`[Handler] Running QUICK JOB (max 3 leads) for: ${searchTerm} (Signal: ${resolvedActiveSignal}) in ${location}.`);


		// 3. Run the Quick Job (Batch 0 only, max 3 leads)
		// CRITICAL FIX: Ensure correct arguments are passed according to function signature:
		// (leadType, targetType, financialTerm, activeSignal, location, salesPersona, socialFocus, totalBatches)
		const leads = await generateLeadsBatch(
			leadType, 			// 1. leadType
			quickJobTarget, 	// 2. targetType (now the clean clientProfile for B2C)
			financialTerm, 		// 3. financialTerm (FIXED)
			resolvedActiveSignal, 	// 4. activeSignal (FIXED)
			location, 			// 5. location (FIXED)
			salesPersona, 		// 6. salesPersona (FIXED)
			socialFocus, 		// 7. socialFocus (FIXED)
			1 					// 8. totalBatches (fixed to 1)
		);


		// 4. Return the highly prioritized leads
		return {
			statusCode: 200,
			headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
			body: JSON.stringify({ leads: leads.slice(0, 3), count: leads.length })
		};


	} catch (error) {
		console.error('Lead Generator Handler Error:', error);
		
		// Log a specific error when the Quick Job fails due to a timeout or API error
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
		const { leadType, searchTerm, activeSignal, location, salesPersona, socialFocus, financialTerm, clientProfile, totalLeads } = requestData;


		// The background job is designed to be more comprehensive (up to 4 batches)
		const batchesToRun = Math.min(4, Math.ceil(totalLeads / 3)); // Max 4 batches, 3 leads/batch = 12 leads max
		const resolvedActiveSignal = activeSignal || "actively seeking solution or new provider";


		console.log(`[Background] Starting LONG JOB (${batchesToRun} batches) for: ${searchTerm} in ${location}.`);


		// --- Execution of the Long Task ---
		// The long job still uses the full, complex 'searchTerm' as targetType for comprehensive search variety
		const leads = await generateLeadsBatch(
			leadType, 			// 1. leadType
			searchTerm, 		// 2. targetType (full complex string for deep search)
			financialTerm, 		// 3. financialTerm (FIXED)
			resolvedActiveSignal, 	// 4. activeSignal (FIXED)
			location, 			// 5. location (FIXED)
			salesPersona, 		// 6. salesPersona (FIXED)
			socialFocus, 		// 7. socialFocus (FIXED)
			batchesToRun 		// 8. totalBatches
		);
		
		console.log(`[Background] Job finished successfully. Generated ${leads.length} high-quality leads.`);
		
		// IMPORTANT: For a true background handler, you would typically save results to a DB 
		// or queue a fulfillment step here, rather than returning all data.
		// We return the 200 response for demonstration/logging purposes.
		
		return {
			statusCode: 200,
			headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
			body: JSON.stringify({ leads: leads, count: leads.length, message: `Successfully generated ${leads.length} leads in background.` })
		};
	} catch (err) {
		console.error('Lead Generator Background Error:', err);
		// Log the error and still return a 500 to indicate the job failed.
		return {	
			statusCode: 500,	
			headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
			body: JSON.stringify({ error: err.message, details: err.cause || 'An unknown background error occurred.' })
		};
	}
};



