// --- Netlify Serverless Function for Lead Generation and Scoring ---

/**
 * Ultimate Premium Lead Generator – Gemini + Google Custom Search
 *
 * This file contains two exports:
 * 1. exports.handler: Synchronous endpoint (guaranteed fast, max 3 leads).
 * 2. exports.background: Asynchronous endpoint (runs up to 15 minutes, unlimited leads).
 *
 * ENV Variables used:
 * - LEAD_QUALIFIER_API_KEY (for Gemini)
 * - RYGUY_SEARCH_API_KEY (Your custom search API key)
 * - RYGUY_SEARCH_ENGINE_ID (Your custom search engine/ID)
 */

const nodeFetch = require('node-fetch');
const fetch = nodeFetch.default || nodeFetch;
const dns = require('dns').promises; // used optionally for MX checks (non-blocking best-effort)

// --- Environment Variable Declarations ---
const GEMINI_API_KEY = process.env.LEAD_QUALIFIER_API_KEY;
const SEARCH_API_KEY = process.env.RYGUY_SEARCH_API_KEY;
const SEARCH_ENGINE_ID = process.env.RYGUY_SEARCH_ENGINE_ID;
// -----------------------------------------

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
	// Uses RYGUY_SEARCH_API_KEY and RYGUY_SEARCH_ENGINE_ID
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
	// Uses LEAD_QUALIFIER_API_KEY
	if (!GEMINI_API_KEY) {
		throw new Error("LEAD_QUALIFIER_API_KEY is missing.");
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
			let cleanedText = raw.replace(/^
