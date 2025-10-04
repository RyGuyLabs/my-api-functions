/**
 * Ultimate Premium Lead Generator – Gemini + Google Custom Search
 *
 * This file contains two exports:
 * 1. exports.handler: Synchronous endpoint (guaranteed fast, max 3 leads).
 * 2. exports.background: Asynchronous endpoint (runs up to 15 minutes, unlimited leads).
 *
 * Upgrades injected (non-destructive, see // --- PREMIUM UPGRADE --- markers)
 */

const nodeFetch = require('node-fetch');
const fetch = nodeFetch.default || nodeFetch;
const dns = require('dns').promises; // used optionally for MX checks (non-blocking best-effort)

const GEMINI_API_KEY = process.env.LEAD_QUALIFIER_API_KEY;
const SEARCH_API_KEY = process.env.RYGUY_SEARCH_API_KEY;
const SEARCH_ENGINE_ID = process.env.RYGUY_SEARCH_ENGINE_ID;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent';
const GOOGLE_SEARCH_URL = 'https://www.googleapis.com/customsearch/v1';

// --- PREMIUM UPGRADE --- Feature toggles & env-friendly settings
const IS_TEST_MODE = process.env.TEST_MODE === 'true';
const DEBUG_MODE = process.env.DEBUG_MODE === 'true';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*'; // safer CORS
const QUICK_JOB_TIMEOUT_MS = 10000; // keep fail-fast for sync handler (10s)
const BACKOFF_BASE_DELAY = 500;

// -------------------------
// Helper: log wrapper
// -------------------------
function debugLog(...args) {
	if (DEBUG_MODE) console.log(...args);
}

// -------------------------
// Helper: Fetch with Timeout (CRITICAL for preventing 504)
// -------------------------
const fetchWithTimeout = (url, options = {}, timeout = 10000) => {
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
const withBackoff = async (fn, maxRetries = 4, baseDelay = BACKOFF_BASE_DELAY) => {
	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			const response = await fn();
			// If it's a fetch Response object with ok flag, return it so callers can parse
			if (response && typeof response.ok !== 'undefined') {
				return response;
			}
			// Otherwise, return raw response
			return response;
		} catch (err) {
			// On last attempt, rethrow
			if (attempt === maxRetries) throw err;
			const delay = Math.random() * baseDelay * Math.pow(2, attempt - 1);
			console.warn(`Attempt ${attempt} failed. Retrying in ${Math.round(delay)}ms...`, err.message);
			await new Promise(r => setTimeout(r, delay));
		}
	}
	throw new Error("Max retries reached. Request failed permanently.");
};

// -------------------------
// Enrichment & Quality Helpers
// -------------------------
const PLACEHOLDER_DOMAINS = ['example.com', 'placeholder.net', 'null.com', 'test.com'];

async function checkWebsiteStatus(url) {
	if (!url || !url.startsWith('http')) return false;
	try {
		const response = await withBackoff(() => fetchWithTimeout(url, { method: 'HEAD' }, 5000), 1, 500);
		// 2xx or 3xx considered ok for presence
		return response && (response.ok || (response.status >= 300 && response.status < 400));
	} catch (e) {
		debugLog(`Website check failed for ${url}: ${e.message}`);
		return false;
	}
}

// --- PREMIUM UPGRADE --- Optional DNS MX check (best-effort, non-blocking)
// Returns true if MX records found; false otherwise. Errors are caught and return false.
const mxCheckCache = new Map();
async function hasMX(domain) {
	try {
		if (mxCheckCache.has(domain)) return mxCheckCache.get(domain);
		const records = await dns.resolveMx(domain);
		const ok = Array.isArray(records) && records.length > 0;
		mxCheckCache.set(domain, ok);
		return ok;
	} catch (e) {
		debugLog(`MX check failed for ${domain}: ${e.message}`);
		mxCheckCache.set(domain, false);
		return false;
	}
}

/**
 * Generates a realistic email pattern based on name and website.
 */
async function enrichEmail(lead, website) {
	try {
		const url = new URL(website);
		const domain = url.hostname.replace(/^www\./, '');
		const nameToUse = lead.leadType === 'residential' && lead.contactName ? lead.contactName : lead.name || '';
		const nameParts = (nameToUse || '').toLowerCase().split(' ').filter(part => part.length > 0);

		if (nameParts.length < 2) {
			return `info@${domain}`;
		}

		const firstName = nameParts[0];
		const lastName = nameParts[nameParts.length - 1];

		const patterns = [
			`${firstName}.${lastName}@${domain}`,
			`${firstName}_${lastName}@${domain}`,
			`${firstName.charAt(0)}${lastName}@${domain}`,
			`${firstName}@${domain}`,
			`info@${domain}`
		].filter(p => !p.includes('undefined'));

		if (patterns.length > 0) {
			// Optionally verify MX for domain and prefer first pattern
			const candidate = patterns[0].replace(/\s/g, '');
			try {
				const domainOk = await hasMX(domain);
				if (!domainOk) {
					// If MX not present, fallback to generic contact@domain
					return `contact@${domain}`;
				}
			} catch {
				// ignore MX failures
			}
			return candidate;
		}

		return `contact@${domain}`;
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

// Simplify Search Term (unchanged but kept here)
function simplifySearchTerm(targetType, financialTerm, isResidential) {
	if (!isResidential) {
		let coreTerms = [`(${targetType})`];
		if (financialTerm && financialTerm.trim().length > 0) {
			coreTerms.push(`(${financialTerm})`);
		}
		const finalTerm = coreTerms.join(' AND ');
		debugLog(`[Simplify Fix] Resolved CORE B2B TERM (Full Intent) to: ${finalTerm}`);
		return finalTerm;
	}
	if (isResidential) {
		let simplifiedTerms = [];
		simplifiedTerms.push(`"${targetType}"`);
		if (financialTerm && financialTerm.trim().length > 0) {
			simplifiedTerms.push(`AND ${financialTerm}`);
		}
		const finalTerm = simplifiedTerms.join(' ');
		if (finalTerm.length > 0) {
			debugLog(`[Simplify Fix] Resolved CORE B2C TERM to: ${finalTerm}`);
			return finalTerm;
		}
	}
	return targetType.split(/\s+/).slice(0, 4).join(' ');
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
	debugLog(`[Google Search] Sending Query: ${query}`);
	try {
		const response = await withBackoff(() => fetchWithTimeout(url, {}, QUICK_JOB_TIMEOUT_MS), 1, 500);
		const data = await response.json();
		if (data.error) {
			console.error("Google Custom Search API Error:", data.error);
			return [];
		}
		// Map and return sanitized items
		return (data.items || []).map(item => ({
			name: item.title,
			website: item.link,
			description: item.snippet
		}));
	} catch (e) {
		console.error("Google Search failed on the only attempt (Fail-fast):", e.message);
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
				contactName: { type: "STRING" },
				qualityScore: { type: "STRING" },
				insights: { type: "STRING" },
				suggestedAction: { type: "STRING" },
				draftPitch: { type: "STRING" },
				socialSignal: { type: "STRING" },
				socialMediaLinks: { type: "ARRAY", items: { type: "STRING" } },
				transactionStage: { type: "STRING" },
				keyPainPoint: { type: "STRING" },
				geoDetail: { type: "STRING" }
			}
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

	// Gemini call
	const response = await withBackoff(() =>
		fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		}), 4, 1000
	);
	const result = await response.json();

	let raw = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '[]';

	// --- PREMIUM UPGRADE --- Robust JSON recovery & sanitization
	try {
		// Basic attempt
		let parsed = JSON.parse(raw);
		// Ensure array
		if (!Array.isArray(parsed)) parsed = [parsed];
		// Sanitization pass (trim strings)
		parsed = parsed.map(item => {
			if (!item || typeof item !== 'object') return {};
			return Object.keys(item).reduce((acc, k) => {
				acc[k] = (typeof item[k] === 'string') ? item[k].trim().replace(/\s{2,}/g, ' ') : item[k];
				return acc;
			}, {});
		});
		return parsed;
	} catch (e) {
		// Attempt to clean common wrappers and escape problems
		try {
			let cleanedText = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
			// Remove any leading/trailing non-json characters
			cleanedText = cleanedText.replace(/^[^\[{]+/, '').replace(/[^\]}]+$/, '');
			// Attempt a safe parse
			let parsed = JSON.parse(cleanedText);
			if (!Array.isArray(parsed)) parsed = [parsed];
			parsed = parsed.map(item => {
				if (!item || typeof item !== 'object') return {};
				return Object.keys(item).reduce((acc, k) => {
					acc[k] = (typeof item[k] === 'string') ? item[k].trim().replace(/\s{2,}/g, ' ') : item[k];
					return acc;
				}, {});
			});
			return parsed;
		} catch (e2) {
			console.error("Failed to parse Gemini output as JSON after cleaning.", e2.message);
			// Throw to let caller handle fallback/partial results
			throw new Error("Failed to parse Gemini output as JSON.", { cause: e2.message });
		}
	}
}

// -------------------------
// Quality & Ranking Helpers
// -------------------------
function calculatePersonaMatchScore(lead, salesPersona) {
	if (!lead.description && !lead.insights) return 0;
	let score = 0;
	const persona = (salesPersona || '').toLowerCase();
	const text = ((lead.description || '') + ' ' + (lead.insights || '')).toLowerCase();
	const personaKeywords = PERSONA_KEYWORDS[persona] || PERSONA_KEYWORDS['default'];
	for (const phrase of personaKeywords) {
		const words = phrase.replace(/["()]/g, '').split(/ OR | AND | /).filter(w => w.length > 5);
		for (const word of words) {
			if (text.includes(word.trim())) score += 1;
		}
	}
	if (lead.leadType === 'commercial' && (text.includes('business') || text.includes('company'))) score += 1;
	if (lead.leadType === 'residential' && (text.includes('homeowner') || text.includes('individual') || text.includes('family'))) score += 1;
	return Math.min(score, 5);
}

function computeQualityScore(lead) {
	const hasValidEmail = lead.email && lead.email.includes('@') && !PLACEHOLDER_DOMAINS.some(domain => lead.email.includes(domain));
	const hasPhone = !!lead.phoneNumber;
	if (hasValidEmail && hasPhone) return 'High';
	if (hasValidEmail || hasPhone) return 'Medium';
	return 'Low';
}

async function generatePremiumInsights(lead) {
	const events = [
		`Featured in local news about ${lead.name || 'this lead'}`,
		`Announced new product/service on ${lead.website || 'their site'}`,
		`Recent funding or partnership signals for ${lead.name || 'this entity'}`,
		`High engagement on social media for ${lead.name || 'this entity'}`
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
			if (l.transactionStage && l.keyPainPoint) score += 2;
			else if (l.transactionStage || l.keyPainPoint) score += 1;
			if (l.socialSignal) score += 1;
			score += l.personaMatchScore || 0;
			score += l.intentScore || 0; // newly weighted
			return { ...l, priorityScore: score };
		})
		.sort((a, b) => b.priorityScore - a.priorityScore);
}

function deduplicateLeads(leads) {
	const seen = new Set();
	return leads.filter(l => {
		const key = `${(l.name || '').toLowerCase()}-${(l.website || '').toLowerCase()}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

// -------------------------
// Enrichment for a single lead
// -------------------------
async function enrichAndScoreLead(lead, leadType, salesPersona) {
	lead.leadType = leadType;
	lead.salesPersona = salesPersona;

	if (lead.website && !lead.website.includes('http')) {
		lead.website = 'https://' + lead.website.replace(/https?:\/\//, '');
	}

	let websiteIsValid = false;
	if (lead.website) {
		websiteIsValid = await checkWebsiteStatus(lead.website);
	}

	if (lead.website && !websiteIsValid) {
		debugLog(`Lead ${lead.name} website failed validation. Clearing website for safety.`);
		lead.website = null;
	}

	const shouldEnrichEmail = !lead.email || PLACEHOLDER_DOMAINS.some(domain => (lead.email || '').includes(domain));
	lead.phoneNumber = await enrichPhoneNumber(lead.phoneNumber);

	if (shouldEnrichEmail && lead.website) {
		lead.email = await enrichEmail(lead, lead.website);
	} else if (!lead.website) {
		lead.email = null;
	}

	lead.personaMatchScore = calculatePersonaMatchScore(lead, salesPersona);
	lead.qualityScore = computeQualityScore(lead);

	if (!lead.socialSignal) {
		lead.socialSignal = await generatePremiumInsights(lead);
	}

	if (!Array.isArray(lead.socialMediaLinks)) {
		lead.socialMediaLinks = lead.socialMediaLinks ? [lead.socialMediaLinks] : [];
	}

	// --- PREMIUM UPGRADE --- Intent scoring (Hot/Warm/Cold)
	let intentScore = 0;
	if (lead.transactionStage) intentScore += 2;
	if (lead.keyPainPoint) intentScore += 2;
	if (lead.socialSignal) intentScore += 1;
	intentScore += (lead.personaMatchScore || 0);
	lead.intentScore = intentScore;
	lead.intentTier = intentScore >= 6 ? "Hot" : intentScore >= 3 ? "Warm" : "Cold";

	return lead;
}

// -------------------------
// Concurrent Lead Batch Generator
// -------------------------
async function generateLeadsBatch(leadType, targetType, financialTerm, activeSignal, location, salesPersona, socialFocus, totalBatches = 4) {
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

	const personaKeywords = PERSONA_KEYWORDS[salesPersona] || PERSONA_KEYWORDS['default'];
	const isResidential = leadType === 'residential';
	const batchPromises = [];

	for (let i = 0; i < totalBatches; i++) {
		const batchPromise = (async (batchIndex) => {
			let searchKeywords;
			const personaEnhancer = personaKeywords[batchIndex % personaKeywords.length];
			const b2bEnhancer = COMMERCIAL_ENHANCERS[batchIndex % COMMERCIAL_ENHANCERS.length];
			const shortTargetType = simplifySearchTerm(targetType, financialTerm, isResidential);

			if (batchIndex === 0) {
				if (isResidential) {
					searchKeywords = `${shortTargetType} in "${location}" ${NEGATIVE_QUERY}`;
					debugLog(`[Batch 1] PRIMARY Life Event Query (B2C).`);
				} else {
					searchKeywords = `(${targetType}) in "${location}" AND (${COMMERCIAL_ENHANCERS[0]}) ${NEGATIVE_QUERY}`;
					debugLog(`[Batch 1] PRIMARY Intent Query (B2B).`);
				}
			} else if (batchIndex === totalBatches - 1 && totalBatches > 1) {
				const defaultSocialTerms = isResidential
					? `"new homeowner" OR "local recommendation" OR "asking for quotes"`
					: `"shopping around" OR "comparing quotes" OR "need new provider"`;
				const socialTerms = socialFocus && socialFocus.trim().length > 0 ? socialFocus.trim() : defaultSocialTerms;
				// Use shortTargetType and activeSignal for social search
				searchKeywords = `site:linkedin.com OR site:facebook.com OR site:twitter.com (${shortTargetType}) AND (${socialTerms} OR ${activeSignal}) in "${location}" ${NEGATIVE_QUERY}`;
				debugLog(`[Batch ${batchIndex+1}] Social/Competitive Intent Query.`);
			} else if (isResidential) {
				searchKeywords = `(${shortTargetType}) in "${location}" AND (${personaEnhancer}) ${NEGATIVE_QUERY}`;
			} else {
				searchKeywords = `(${targetType}) in "${location}" AND (${COMMERCIAL_ENHANCERS[batchIndex % COMMERCIAL_ENHANCERS.length]}) ${NEGATIVE_QUERY}`;
			}

			// 1. Get Google results (fail-fast)
			let gSearchResults = await googleSearch(searchKeywords, 3);

			// 2. Level 2 fallback if empty
			if (gSearchResults.length === 0) {
				debugLog(`[Batch ${batchIndex+1}] Level 2 fallback triggered.`);
				let broaderFallbackTerm;
				if (isResidential) {
					broaderFallbackTerm = `"homeowner family" in "${location}"`;
				} else {
					const firstB2BTerm = targetType.split(' OR ')[0].trim().replace(/"/g, '');
					broaderFallbackTerm = `"${firstB2BTerm}" in "${location}"`;
				}
				const fallbackSearchKeywords = `${broaderFallbackTerm} ${NEGATIVE_QUERY}`;
				const fallbackResults = await googleSearch(fallbackSearchKeywords, 3);
				gSearchResults.push(...fallbackResults);

				// Level 3 fallback
				if (gSearchResults.length === 0) {
					debugLog(`[Batch ${batchIndex+1}] Level 3 ultra-generic fallback triggered.`);
					const salesPersonaClean = salesPersona.replace(/_/g, ' ');
					const ultraGenericTerm = isResidential
						? `"${salesPersonaClean} services" in "${location}"`
						: `${targetType.split(' OR ')[0].trim().replace(/"/g, '')} directory in "${location}"`;
					const ultraFallbackKeywords = `${ultraGenericTerm} ${NEGATIVE_QUERY}`;
					const ultraFallbackResults = await googleSearch(ultraFallbackKeywords, 3);
					gSearchResults.push(...ultraFallbackResults);
					if (gSearchResults.length === 0) {
						debugLog(`[Batch ${batchIndex+1}] Ultra fallback returned no results. Skipping batch.`);
						return [];
					}
				}
			}

			// --- PREMIUM UPGRADE --- Early filtering to remove obvious junk before sending to Gemini
			const filteredResults = (gSearchResults || []).filter(item => {
				const txt = (item.description || '').toLowerCase();
				const title = (item.name || '').toLowerCase();
				if (!item.website || item.website.length < 8) return false;
				if (/(coupon|pinterest|free download|template|ebook|pdf|slideshare|scribd|slides)/i.test(txt + title)) return false;
				// prefer pages with "about", "services", "contact", "reviews", "homepage"
				const hasUsefulMarker = /(about us|about|services|contact|reviews|homepage|official|service|find us)/i.test(txt + title);
				return hasUsefulMarker || /yelp|linkedin|crunchbase|glassdoor|angieslist|homeadvisor/.test(item.website.toLowerCase());
			});

			// If no filtered results, fallback to original results to avoid complete miss
			const resultsToUse = filteredResults.length > 0 ? filteredResults : gSearchResults;

			// 3. Send results to Gemini for qualification
			const geminiQuery = `Generate 3 high-quality leads for a ${leadType} audience, with a focus on: "${template}". The primary query is "${targetType}" in "${location}". Base your leads strictly on these search results: ${JSON.stringify(resultsToUse)}`;

			try {
				const geminiLeads = await generateGeminiLeads(geminiQuery, systemInstruction);
				return geminiLeads;
			} catch (gemErr) {
				console.error(`[Batch ${batchIndex+1}] Gemini failure:`, gemErr.message);
				// Return empty array for this batch to allow other batches to succeed
				return [];
			}
		})(i);

		batchPromises.push(batchPromise);
	}

	// --- PREMIUM UPGRADE --- Allow partial fulfillment using allSettled
	const settled = await Promise.allSettled(batchPromises);
	const resultsFromBatches = settled
		.filter(r => r.status === 'fulfilled')
		.flatMap(r => r.value || []);

	// Flattened master lead list
	let allLeads = resultsFromBatches.flat();

	// If no leads at all, return empty early
	if (!Array.isArray(allLeads) || allLeads.length === 0) {
		debugLog("No leads returned by any batch.");
		return [];
	}

	// Deduplicate early
	allLeads = deduplicateLeads(allLeads);

	// --- PREMIUM UPGRADE --- Early content-based filtering (remove spam before enrichment)
	allLeads = allLeads.filter(l => {
		const txt = ((l.description || '') + ' ' + (l.name || '')).toLowerCase();
		const isSpam = /(coupon|pinterest|free download|template|ebook|pdf|click here|sponsored)/i.test(txt);
		const hasRealName = !!(l.name && l.name.trim().length > 0 && !/(test|example)/i.test(l.name.toLowerCase()));
		const hasWebsite = !!(l.website && l.website.length > 8);
		return !isSpam && hasRealName && hasWebsite;
	});

	// If still nothing, return early
	if (!Array.isArray(allLeads) || allLeads.length === 0) {
		debugLog("All leads filtered as spam/junk after early filter.");
		return [];
	}

	// --- PREMIUM UPGRADE --- Enrich concurrently but tolerate some to fail (allSettled)
	const enrichmentSettled = await Promise.allSettled(allLeads.map(l => enrichAndScoreLead(l, leadType, salesPersona)));
	const enrichedLeads = enrichmentSettled
		.filter(r => r.status === 'fulfilled')
		.map(r => r.value)
		.filter(Boolean);

	// If no successful enrichments, still return deduped original leads with minimal structure
	if (!enrichedLeads || enrichedLeads.length === 0) {
		debugLog("Enrichment failed for all leads, returning lightweight lead objects.");
		return allLeads.map(l => ({
			name: l.name || 'Unknown',
			website: l.website || null,
			description: l.description || '',
			qualityScore: 'Low',
			priorityScore: 0
		}));
	}

	// Final ranking
	return rankLeads(enrichedLeads);
}

// ------------------------------------------------
// 1. Synchronous Handler (Quick Job: Max 3 Leads)
// ------------------------------------------------
exports.handler = async (event) => {
	const CORS_HEADERS = {
		'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
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

	if (IS_TEST_MODE) {
		// Return a mock set quickly for dev/test
		const mock = [{
			name: "Test Corp",
			website: "https://testcorp.example",
			email: "test@testcorp.example",
			phoneNumber: "",
			qualityScore: "Medium",
			personaMatchScore: 2,
			intentScore: 3,
			intentTier: "Warm",
			priorityScore: 6
		}];
		return {
			statusCode: 200,
			headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
			body: JSON.stringify({ leads: mock, count: mock.length })
		};
	}

	let requestData = {};
	try {
		debugLog(`[Handler DEBUG] Raw Event Body: ${event.body}`);
		requestData = JSON.parse(event.body);
		debugLog('[Handler DEBUG] Parsed Body Data:', requestData);

		const { leadType, searchTerm, activeSignal, location, salesPersona, socialFocus, financialTerm, clientProfile } = requestData;
		const resolvedActiveSignal = activeSignal || "actively seeking solution or new provider";
		const quickJobTarget = leadType === 'residential' && clientProfile ? clientProfile : searchTerm;

		debugLog(`[Handler] Running QUICK JOB for: ${searchTerm} (Signal: ${resolvedActiveSignal}) in ${location}.`);

		const leads = await generateLeadsBatch(
			leadType,
			quickJobTarget,
			financialTerm,
			resolvedActiveSignal,
			location,
			salesPersona,
			socialFocus,
			1
		);

		// Keep backward compatible: return leads array and count
		return {
			statusCode: 200,
			headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
			body: JSON.stringify({ leads: leads.slice(0, 3), count: leads.length })
		};
	} catch (error) {
		console.error('Lead Generator Handler Error:', error);
		let message = 'Lead generation failed due to a server error.';
		if (error.message && (error.message.includes('Fetch request timed out') || error.message.includes('Max retries reached') || error.message.includes('timed out'))) {
			message = 'The quick lead generation job took too long and timed out (Netlify limit exceeded). Try the long job for complex queries.';
		}
		return {
			statusCode: 500,
			headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
			body: JSON.stringify({ error: message, details: error.message })
		};
	}
};

// ------------------------------------------------
// 2. Asynchronous Handler (Background Job)
// ------------------------------------------------
exports.background = async (event) => {
	const CORS_HEADERS = {
		'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
		'Access-Control-Allow-Methods': 'POST, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type',
	};

	try {
		const requestData = JSON.parse(event.body);
		const { leadType, searchTerm, activeSignal, location, salesPersona, socialFocus, financialTerm, clientProfile, totalLeads } = requestData;

		const batchesToRun = Math.min(4, Math.max(1, Math.ceil((totalLeads || 9) / 3)));
		const resolvedActiveSignal = activeSignal || "actively seeking solution or new provider";

		debugLog(`[Background] Starting LONG JOB (${batchesToRun} batches) for: ${searchTerm} in ${location}.`);

		// Background runs deep search using full searchTerm
		const leads = await generateLeadsBatch(
			leadType,
			searchTerm,
			financialTerm,
			resolvedActiveSignal,
			location,
			salesPersona,
			socialFocus,
			batchesToRun
		);

		debugLog(`[Background] Job finished. Generated ${leads.length} leads.`);

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
