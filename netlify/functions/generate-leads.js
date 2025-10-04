/*
 * Ultimate Premium Lead Generator – Tiered Search Orchestrator
 *
 * CRITICAL FIXES FOR 504 GATEWAY TIMEOUT (SYNCHRONOUS HANDLER):
 * 1. CONDITIONAL RETRIES: The 'generateGeminiLeads' function now dynamically sets the number of retries:
 * - Quick Job (isQuickJob = true): Max 1 attempt (no retries) to ensure completion under 10 seconds.
 * - Long Job (isQuickJob = false): Max 3 retries for maximum reliability and lead abundance.
 * 2. Reduced Quick Job Search Volume: Remains at 2 baseline results to minimize token count and speed up the qualification step.
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
const DIR_INFO_CSE_ID = process.env.RYGUY_SEARCH_ENGINE_ID;  // NOTE: Reusing the primary CSE ID for directory search

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent';
const GOOGLE_SEARCH_URL = 'https://www.googleapis.com/customsearch/v1';

// Defines how many batches the long job will run
const MAX_BATCHES_LONG_JOB = 5; 

// --- CORS DEFINITION (CRITICAL) ---
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

// -------------------------
// Helper: Fetch with Timeout 
// -------------------------
const fetchWithTimeout = (url, options, timeout = 10000) => {
	// If no timeout is passed, default to 10 seconds.
	const finalTimeout = timeout || 10000;
	return Promise.race([
		fetch(url, options),
		new Promise((_, reject) =>
			setTimeout(() => reject(new Error('Fetch request timed out')), finalTimeout)
		)
	]);
};

// -------------------------
// Helper: Exponential Backoff with Full Jitter
// -------------------------
const withBackoff = async (fn, maxRetries = 4, baseDelay = 500) => {
	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			// fn() is expected to be a function returning a fetch promise.
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
			await new Promise(r => setTimeout(r, delay));
			
		} catch (err) {
			if (attempt === maxRetries) throw err;
			
			const delay = Math.random() * baseDelay * Math.pow(2, attempt - 1);
			await new Promise(r => setTimeout(r, delay));
		}
	}
	throw new Error("Max retries reached. Request failed permanently.");
};


// --------------------------------------------------------
// --- CORE API INTERACTION ---
// --------------------------------------------------------

/**
 * Executes a Google Custom Search Engine (CSE) query, supporting pagination via 'start'.
 */
async function googleSearch(query, numResults = 3, cseId, start = 1) {
    if (!SEARCH_MASTER_KEY || !cseId) {
        console.error("Missing Search API Key or CSE ID.");
        return [];
    }
    
    // CRITICAL: Ensure numResults is within 1 to 10. Max results reduced for 504 fix.
    const safeNumResults = Math.max(1, Math.min(10, numResults));
    
    // CRITICAL ADDITION: Include the 'start' parameter for pagination
    const url = `${GOOGLE_SEARCH_URL}?key=${SEARCH_MASTER_KEY}&cx=${cseId}&q=${encodeURIComponent(query)}&num=${safeNumResults}&start=${start}`;

    try {
        // Search uses default maxRetries = 4
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

// Define the required JSON Schema for lead qualification
const LEAD_GENERATION_SCHEMA = {
    type: "ARRAY",
    description: "A list of qualified leads, each based on the provided search results.",
    items: {
        type: "OBJECT",
        properties: {
            companyName: { type: "STRING", description: "The name of the company or lead." },
            website: { type: "STRING", description: "The primary website or listing URL for the lead. MUST be a valid, extractable URL or domain (e.g., example.com). Use 'N/A' if not found." },
            qualificationSummary: { type: "STRING", description: "A concise, high-intent summary (1-2 sentences) explaining why this lead is a strong fit based on the search snippets. MUST mention a financial term, signal, or specific need if one is found. Use 'N/A' if summary cannot be written." },
            painPoint: { type: "STRING", description: "The single most relevant high-intent pain point, trigger, or signal identified. If none, return 'N/A'." },
            contactName: { type: "STRING", description: "The most likely contact person's name (e.g., CEO, Director of IT), if available or inferable. If none, return 'N/A'." },
            industry: { type: "STRING", description: "The determined industry of the lead." },
            location: { type: "STRING", description: "The primary location of the lead." }
        },
        required: ["companyName", "website", "qualificationSummary", "painPoint", "contactName", "industry"] 
    }
};

/**
 * Uses Gemini API to qualify and structure leads from search results.
 * @param {boolean} isQuickJob - Determines if the call is part of the synchronous quick job.
 */
async function generateGeminiLeads(query, systemInstruction, isQuickJob) {
    if (!GEMINI_API_KEY) {
        console.error("Missing Gemini API Key.");
        return [];
    }

    // Conditional retry logic for stability vs. speed
    // Quick job needs max speed, so 1 attempt (0 retries)
    // Long job needs max reliability, so 4 attempts (3 retries)
    const MAX_API_RETRIES = isQuickJob ? 1 : 3; 

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
        // Timeout set to 8s for both job types to prevent excessive single-call latency
        const GEMINI_TIMEOUT = 8000; 
        
        const response = await withBackoff(() => 
            fetchWithTimeout(apiUrlWithKey, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }, GEMINI_TIMEOUT),
            MAX_API_RETRIES // <-- Dynamically set retries here
        );
        
        const result = await response.json();
        const candidate = result.candidates?.[0];

        if (candidate && candidate.content?.parts?.[0]?.text) {
            const jsonText = candidate.content.parts[0].text.trim();
            const cleanJsonText = jsonText.replace(/^```json\s*|```\s*$/g, '').trim(); 
            return JSON.parse(cleanJsonText);
        }

        console.error("Gemini failed to return content or valid JSON structure:", result);
        return [];

    } catch (error) {
        console.error('Failed during Gemini lead generation:', error.message);
        throw error; // Re-throw to be caught by the outer handler for proper 504/timeout reporting
    }
}


// --------------------------------------------------------
// --- DETERMINISTIC SCORING & ENRICHMENT LOGIC & HELPERS ---
// --------------------------------------------------------

/**
 * Helper function to extract a clean domain name from a URL or string.
 */
function extractDomain(url) {
    if (!url || url.toLowerCase() === 'n/a') return 'N/A';
    try {
        // Try to parse it as a URL
        const parsedUrl = new URL(url.startsWith('http') ? url : `https://${url}`);
        // Return the hostname, stripped of 'www.'
        return parsedUrl.hostname.replace(/^www\./, '');
    } catch (e) {
        // If it fails to parse as a URL, assume it might be a valid domain already
        if (url.includes('.')) return url.toLowerCase().trim();
        return 'N/A';
    }
}


/**
 * Enrichment: Returns N/A as email verification requires an external API key.
 */
function enrichEmail() { 
    return "N/A (Verification Requires External API Key)"; 
}

/**
 * Enrichment: Returns N/A as phone enrichment requires an external API key.
 */
function enrichPhoneNumber() { 
    return "N/A (Verification Requires External API Key)"; 
}

/**
 * Verifiable Insight: Generates a simple, deterministic insight.
 */
async function generatePremiumInsights(lead) { 
    if (lead.qualificationSummary && lead.painPoint && lead.painPoint.toLowerCase() !== 'n/a') {
        return `Insight: Primary signal is the pain point: "${lead.painPoint}". Qualification: ${lead.qualificationSummary}`;
    }
    return 'N/A: Insufficient data for a verifiable premium insight.';
}

/**
 * Verifiable Scoring: Calculates the lead score based on the success of the tiered search criteria.
 */
function calculateLeadScore(lead, criteria) {
    const textToCheck = `${lead.qualificationSummary || ''} ${lead.painPoint || ''}`.toLowerCase();
    const baseScore = 50; 
    let premiumMatchCount = 0;
    
    const premiumCriteria = [
        { key: 'targetType', value: criteria.targetType, weight: 15 },
        { key: 'financialTerm', value: criteria.financialTerm, weight: 20 },
        { key: 'socialFocus', value: criteria.socialFocus, weight: 15 },
    ];
    
    let totalPremiumPoints = 0;

    for (const item of premiumCriteria) {
        if (item.value && item.value.trim() !== '') {
            if (textToCheck.includes(item.value.toLowerCase())) {
                totalPremiumPoints += item.weight;
                premiumMatchCount++;
            }
        }
    }

    let finalScore = Math.min(100, baseScore + totalPremiumPoints);

    let qualityBand;
    if (finalScore >= 80) {
        qualityBand = 'High';
    } else if (finalScore >= 65) {
        qualityBand = 'Medium';
    } else {
        qualityBand = 'Low';
    }

    return { 
        score: Math.round(finalScore), 
        qualityBand: qualityBand, 
        premiumMatchCount: premiumMatchCount 
    };
}

/**
 * Sorts leads primarily by Lead Score (0-100), descending.
 */
function rankLeads(leads) {
    return leads.sort((a, b) => (b.leadScore || 0) - (a.leadScore || 0));
}

/**
 * Performs final enrichment and scoring based on deterministic rules and user criteria.
 */
async function enrichAndScoreLead(lead, criteria) {
    // 1. Core Enrichment (Deterministic N/A for external data)
    
    // Ensure website is a clean domain name
    lead.website = extractDomain(lead.website);
    
    lead.email = enrichEmail(lead);
    lead.phone = enrichPhoneNumber(lead); 

    // 2. Compute Layered Lead Score
    const scoreResults = calculateLeadScore(lead, criteria);
    lead.leadScore = scoreResults.score;
    lead.qualityBand = scoreResults.qualityBand;
    lead.verifiableMatches = scoreResults.premiumMatchCount;

    // 3. Generate Insight
    lead.premiumInsight = await generatePremiumInsights(lead);
    
    // Add source tier info for tracking
    lead.sourceTier = lead.tier || 1; 
    
    return lead;
}

/**
 * Deduplicates search results based on company name and website/link.
 */
function deduplicateLeads(leads) {
    const uniqueMap = new Map();
    for (const lead of leads) {
        // Use cleaned website (or link if website is not set) for deduplication key
        const websiteOrLink = extractDomain(lead.website || lead.link) || lead.companyName?.toLowerCase();
        const key = `${lead.companyName?.toLowerCase()}_${websiteOrLink}`;
        if (!uniqueMap.has(key)) {
            uniqueMap.set(key, lead);
        }
    }
    return Array.from(uniqueMap.values());
}

/**
 * Simplifies search term for query construction.
 */
function simplifySearchTerm(targetType, financialTerm, isResidential) {
    if (isResidential) return financialTerm || targetType || 'homeowner';
    if (targetType && financialTerm) return `${targetType} ${financialTerm}`;
    return targetType || financialTerm || 'business service';
}

const NEGATIVE_FILTERS = [ `-job`, `-careers`, `-"press release"`, `-"blog post"`, `-"how to"`, `-"ultimate guide"`];
const NEGATIVE_QUERY = NEGATIVE_FILTERS.join(' ');


// -------------------------
// Lead Generator Core (TIERED ORCHESTRATOR)
// -------------------------
async function generateLeadsBatch(leadType, targetType, financialTerm, activeSignal, location, socialFocus, industry, size, isQuickJob = true) {
	
	const template = leadType === 'residential'
		? "Focus on individual homeowners, financial capacity, recent property activities."
		: "Focus on businesses, size, industry relevance, recent developments.";
	
    // Aggressive prompting for depth, intent, and summary
	const systemInstruction = `You are an expert Lead Generation analyst using the provided data.
You MUST follow the JSON schema provided in the generation config.
CRITICAL: All information MUST pertain to the lead referenced in the search results.
**PRIORITY 1: The 'qualificationSummary' MUST be a detailed, high-intent narrative (1-2 sentences). It MUST synthesize information from multiple snippets and explicitly reference the core criteria (targetType, financialTerm, or socialFocus) to justify the lead's quality. If content is minimal, infer the highest possible intent.**
**PRIORITY 2: The 'painPoint' field MUST be filled with the single clearest high-intent signal, trigger, or problem found. If the source material is generic, you MUST infer a likely, specific pain point based on the industry and search query (e.g., 'Outdated ERP System' instead of just 'N/A').**
**PRIORITY 3: The 'website' MUST be extracted as a clean domain or URL.**
**PRIORITY 4: If any required field (contactName, website, industry, location) cannot be extracted, its value MUST be the string 'N/A' to ensure schema compliance and proper parsing. Summary and PainPoint should only be 'N/A' as a last resort.**
The leads must align with the target audience: ${template}.`;


	const isResidential = leadType === 'residential';
	const hasPremiumKeywords = (targetType && targetType.length > 0) || (financialTerm && financialTerm.length > 0) || (socialFocus && socialFocus.length > 0);
	const shortTargetType = simplifySearchTerm(targetType, financialTerm, isResidential);
	
    // Determine search intensity and batch count based on job mode
    // QUICK JOB FIX: maxResultsTier1 reduced to 2 for speed
    const numBatches = isQuickJob ? 1 : MAX_BATCHES_LONG_JOB;
    const maxResultsTier1 = isQuickJob ? 2 : 5; 
    const maxResultsTier2 = isQuickJob ? 1 : 3; 

	
	let allSearchResults = [];
    
    // --- BATCHING LOOP FOR ABUNDANCE (Long Job Only) ---
    for (let batch = 0; batch < numBatches; batch++) {
        // Calculate the 'start' offset for pagination (1, 6, 11, 16, 21...)
        const startOffset = (batch * maxResultsTier1) + 1;
        
        // This array holds all search promises for the current batch
        const searchPromises = [];
        
        console.log(`[Batch ${batch + 1}/${numBatches}] Starting searches with offset: ${startOffset}. Tier 1 Results: ${maxResultsTier1}, Tier 2 Results: ${maxResultsTier2}`);

        // --- TIER 1: GUARANTEED BASELINE FIRMOGRAPHIC SEARCH (Required) ---
        if (!DIR_INFO_CSE_ID) {
            throw new Error("Configuration Error: DIR_INFO_CSE_ID is missing.");
        }

        const baselineTerms = [industry, size, location].filter(term => term && term.trim().length > 0);
        const baselineQuery = `${baselineTerms.join(' AND ')} ${NEGATIVE_QUERY}`;
        
        searchPromises.push(
            googleSearch(baselineQuery, maxResultsTier1, DIR_INFO_CSE_ID, startOffset) 
            .then(results => results.map(r => ({ ...r, tier: 1, type: 'Directory/Firmographic', companyName: r.title })))
        );


        // --- TIER 2: PREMIUM HIGH-INTENT SEARCHES (Intensity determined by isQuickJob) ---
        if (hasPremiumKeywords) {
            
            // 1. B2B_PAIN_CSE_ID (Review/Pain Sites) - HIGH PRIORITY SIGNAL
            if (B2B_PAIN_CSE_ID) {
                const query = `${shortTargetType} AND ("pain point" OR "switching from" OR "frustrated with") in "${location}" ${NEGATIVE_QUERY}`;
                searchPromises.push(
                    googleSearch(query, maxResultsTier2, B2B_PAIN_CSE_ID, startOffset)
                    .then(results => results.map(r => ({ ...r, tier: 2, type: 'Pain/Review', companyName: r.title })))
                );
            }
            
            // 2. TECH_SIM_CSE_ID (Tech stack/Financial searches) - HIGH PRIORITY SIGNAL
            if (TECH_SIM_CSE_ID && financialTerm) {
                const query = `${financialTerm} stack recent investments ${NEGATIVE_QUERY}`;
                searchPromises.push(
                    googleSearch(query, maxResultsTier2, TECH_SIM_CSE_ID, startOffset) 
                    .then(results => results.map(r => ({ ...r, tier: 2, type: 'Tech/Financial', companyName: r.title })))
                );
            }

            // 3. CORP_COMP_CSE_ID (Competitor Searches) - ONLY ENABLED FOR LONG JOB
            if (!isQuickJob && CORP_COMP_CSE_ID && targetType) {
                const query = `${targetType} competitors vs alternative ${NEGATIVE_QUERY}`;
                searchPromises.push(
                    googleSearch(query, maxResultsTier2, CORP_COMP_CSE_ID, startOffset) 
                    .then(results => results.map(r => ({ ...r, tier: 2, type: 'Competitor/Comparison', companyName: r.title })))
                );
            }
            
            // 4. SOCIAL_PRO_CSE_ID (Job Title / Social Focus) - ONLY ENABLED FOR LONG JOB
            if (!isQuickJob && SOCIAL_PRO_CSE_ID && socialFocus) {
                const query = `${socialFocus} site:linkedin.com OR site:x.com OR site:youtube.com ${NEGATIVE_QUERY}`;
                searchPromises.push(
                    googleSearch(query, maxResultsTier2, SOCIAL_PRO_CSE_ID, startOffset) 
                    .then(results => results.map(r => ({ ...r, tier: 2, type: 'Social/Persona', companyName: r.title })))
                );
            }
            
        } 
        
        // --- Execute Searches for Current Batch ---
        const batchResultsFromSearches = await Promise.all(searchPromises);
        const newResults = batchResultsFromSearches.flat();
        
        console.log(`[Batch ${batch + 1}/${numBatches}] Retrieved ${newResults.length} raw results.`);

        // Add results from this batch to the total
        allSearchResults.push(...newResults);

        // Safety break if we hit a search limit or the last batch was empty
        if (newResults.length === 0 && batch > 0) {
            console.log(`[Batch ${batch + 1}/${numBatches}] Batch returned zero results. Stopping further batches.`);
            break; 
        }
    } // END BATCHING LOOP
    
	
	// 3. Deduplicate and finalize search results
	allSearchResults = deduplicateLeads(allSearchResults);
	
	console.log(`[Orchestrator] Aggregated ${allSearchResults.length} unique search results from ${numBatches} batches.`);

	if (allSearchResults.length === 0) {
		console.warn("Aggregated search returned zero unique results. Cannot proceed.");
		return [];
	}
	
	// 4. Feed aggregated results to Gemini for qualification (ONE TIME)
	const searchSnippets = allSearchResults.map(r => 
        `Title: ${r.title}\nSnippet: ${r.snippet}\nLink: ${r.link}\nSource Type: ${r.type}\n---`
    ).join('\n');
    
	const geminiQuery = `Generate leads for a ${leadType} audience in the ${industry} sector (${size || 'All Sizes'}). Base your leads STRICTLY on the following AGGREGATED search results from specialized engines, focusing on the company/lead, website, and a strong qualification summary:
    
    SEARCH RESULTS:
    ${searchSnippets}`;

	const geminiLeads = await generateGeminiLeads(geminiQuery, systemInstruction, isQuickJob); // <-- Pass isQuickJob
	
	// 5. Final Enrichment and Ranking (Concurrent)
	let allLeads = deduplicateLeads(geminiLeads);
	
	// Combine all necessary criteria into a single object for the scoring function
    const fullCriteria = {
        industry, size, location,
        targetType, // keyword/demographic
        financialTerm, // signal
        socialFocus // jobTitle
    };
	
	// Add firmographic data back to the leads from the request payload
	allLeads = allLeads.map(lead => ({
	    ...lead,
	    industry: lead.industry || industry,
	    location: lead.location || location,
	    size: size,
	}));
	
	const enrichmentPromises = allLeads.map(lead => 
		enrichAndScoreLead(lead, fullCriteria) 
	);
	const enrichedLeads = await Promise.all(enrichmentPromises);

	return rankLeads(enrichedLeads);
}


// ------------------------------------------------
// 1. Synchronous Handler (Quick Job: Max 3 Leads)
// ------------------------------------------------
exports.handler = async (event) => {
	
    // CRITICAL FIX FOR CORS: Ensure OPTIONS preflight returns headers
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
		const { mode, filters } = requestData;
		const { industry, size, location, keyword, jobTitle, demographic, signal } = filters;
        
        const leadType = mode === 'b2c' ? 'residential' : 'b2b';
        const targetType = leadType === 'residential' ? demographic : keyword;
        const financialTerm = signal; // Active signal / Financial term
        const socialFocus = jobTitle; // Closest match for persona-specific searches

		// --- STRICT VALIDATION (400 Bad Request) ---
		if (!industry || !location) { 
			const missingFields = [];
			if (!industry) missingFields.push('industry');
			if (!location) missingFields.push('location');
			
			return {
				statusCode: 400,
				headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
				body: JSON.stringify({ error: `Bad Request: Missing mandatory baseline fields for Tier 1 search: ${missingFields.join(', ')}.` })
			};
		}
		// --------------------------------------------
		
		const resolvedActiveSignal = signal || "actively seeking solution or new provider";
		
		console.log(`[Handler] Running QUICK JOB (Tiered Orchestrator) for: ${industry}, ${size || 'All Sizes'}, ${location}.`);

        // isQuickJob = true ensures min results (2) and only 1 Gemini attempt (no retries)
		const leads = await generateLeadsBatch(
			leadType, targetType, financialTerm, resolvedActiveSignal, location, socialFocus, industry, size, true 
		);
		
		// 200 Success - MUST include CORS headers
		return {
			statusCode: 200,
			headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
			body: JSON.stringify(leads.slice(0, 3))
		};


	} catch (error) {
		console.error('Lead Generator Handler Error:', error);
		
		let message = 'Lead generation failed due to a server error.';
		if (error.message.includes('Fetch request timed out') || error.message.includes('Max retries reached')) {
			message = 'The quick lead generation job took too long and timed out (Internal API failure). Please use the long job for complex or heavy queries.';
		}
		if (error.message.includes('Configuration Error')) {
			message = error.message;
		}

		// 500 Server Error - MUST include CORS headers
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
	
	try {
		const requestData = JSON.parse(event.body);
		const { mode, filters } = requestData;
		const { industry, size, location, keyword, jobTitle, demographic, signal } = filters;
        
        const leadType = mode === 'b2c' ? 'residential' : 'b2b';
        const targetType = leadType === 'residential' ? demographic : keyword;
        const financialTerm = signal;
        const socialFocus = jobTitle;

		// --- STRICT VALIDATION (400 Bad Request) ---
		if (!industry || !location) {
			const missingFields = [];
			if (!industry) missingFields.push('industry');
			if (!location) missingFields.push('location');
			
			console.error(`[Background] Missing mandatory baseline fields: ${missingFields.join(', ')}`);

			return {
				statusCode: 400,
				headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
				body: JSON.stringify({ error: `Bad Request: Missing mandatory baseline fields for Tier 1 search: ${missingFields.join(', ')}.` })
			};
		}
		// --------------------------------------------

		const resolvedActiveSignal = signal || "actively seeking solution or new provider";

		console.log(`[Background] Starting LONG JOB (${MAX_BATCHES_LONG_JOB} batches) for: ${industry}, ${size || 'All Sizes'}, ${location}.`);

        // isQuickJob = false enables 5 batches and 3 Gemini retries for max abundance and reliability
		const leads = await generateLeadsBatch(
			leadType, targetType, financialTerm, resolvedActiveSignal, location, socialFocus, industry, size, false 
		);
		
		console.log(`[Background] Job finished successfully. Generated ${leads.length} high-quality leads.`);
		
		// 200 Success - MUST include CORS headers
		return {
			statusCode: 200,
			headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
			body: JSON.stringify(leads)
		};
	} catch (err) {
		console.error('Lead Generator Background Error:', err);
		
		let message = err.message;
		if (err.message.includes('Configuration Error')) {
			message = err.message;
		}
		
		// 500 Server Error - MUST include CORS headers
		return {	
			statusCode: 500,	
			headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
			body: JSON.stringify({ error: message, details: err.cause || 'An unknown background error occurred.' })
		};
	}
};
