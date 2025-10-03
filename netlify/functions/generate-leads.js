/**
* Netlify Background Serverless Function: generate-leads-background
* * Execution Limit increased from 30 seconds (standard) to 15 minutes (background function).
* * This is the final orchestrator function. It uses 1 Gemini Key and 1 Master Search Key
* to run 5 specialized searches via unique Custom Search Engine (CSE) IDs, aggregating
* the evidence before sending it to the LLM for high-quality, specialized scoring.
* * ENVIRONMENT VARIABLES REQUIRED:
* 1. LEAD_QUALIFIER_API_KEY (Gemini Key)
* 2. RYGUY_SEARCH_API_KEY (Master Search Key for all CSE calls)
* 3. B2B_PAIN_CSE_ID (CSE ID for Review/Pain Sites)
* 4. CORP_COMP_CSE_ID (CSE ID for Legal/Compliance Sites)
* 5. TECH_SIM_CSE_ID (CSE ID for Technology Stack Sites)
* 6. SOCIAL_PRO_CSE_ID (CSE ID for Social/Professional Sites)
* 7. DIR_INFO_CSE_ID (CSE ID for Directory/Firmographic Sites)
*/

const MODEL = 'gemini-2.5-flash-preview-05-20';
const GEMINI_API_URL_BASE = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
// Base URL for Google Custom Search API.
const CSE_API_URL_BASE = `https://www.googleapis.com/customsearch/v1`;

// --- CORE GUIDANCE FOR GEMINI SYNTHESIS ---
const SYSTEM_PROMPT_GUIDANCE = `
You are a Lead Scoring and Evidence Synthesis Engine. You have been provided with FIVE distinct blocks of search evidence.
CRITICAL DIRECTIVE: You MUST base your final score (0-100) and analysis ONLY on the evidence provided in these five blocks. Do not perform external searches. Analyze the segregated evidence and output a single, consolidated, strictly formatted JSON object. Prioritize evidence based on the mode: B2B (competitive pain, financial distress, high hiring growth) or B2C (explicit purchasing intent, specific problem, recent life events).
`;

// --- FUNCTION TO CALL CUSTOM SEARCH ENGINE (CSE) ---
/**
* Executes a single, specialized search against a defined CSE index.
* @param {string} query - The core query (Company Name).
* @param {string} apiKey - The RYGUY_SEARCH_API_KEY.
* @param {string} cseId - The unique CX ID for this search engine.
* @param {string} keyName - Friendly name for logging/evidence block.
* @param {string} keywords - Specialized keywords to append to the query.
* @returns {Promise<string>} Structured text block of search evidence.
*/
async function runCustomSearch(query, apiKey, cseId, keyName, keywords) {
    // We combine the core query (company name or B2C intent phrase) with high-intent keywords
    const fullQuery = `${query} ${keywords}`;
    // Keeping number of results at 1 for efficiency, but the 15-minute limit is now available if needed.
    const url = `${CSE_API_URL_BASE}?key=${apiKey}&cx=${cseId}&q=${encodeURIComponent(fullQuery)}&num=1`;

    try {
        const response = await fetch(url);
        
        // Exponential backoff logic omitted for brevity, but should be added in production.

        if (!response.ok) {
            console.error(`CSE API Error for ${keyName}: ${response.status} - ${response.statusText}`);
            return `--- ${keyName} EVIDENCE FAILED ---`;
        }

        const data = await response.json();
        
        // Structure the CSE results into a clean text block for the LLM
        if (data.items && data.items.length > 0) {
            let evidenceText = `--- ${keyName} EVIDENCE START ---\n`;
            data.items.forEach((item, index) => {
                evidenceText += `Source ${index + 1} (${item.displayLink}): ${item.snippet}\n`;
            });
            evidenceText += `--- ${keyName} EVIDENCE END ---\n`;
            return evidenceText;
        }
        return `--- ${keyName} EVIDENCE: No specific results found. ---\n`;

    } catch (e) {
        console.error(`General Error during CSE call for ${keyName}:`, e.message);
        return `--- ${keyName} EVIDENCE FAILED DUE TO CRITICAL ERROR ---`;
    }
}


// --- NETLIFY HANDLER ---
exports.handler = async (event) => {
    // CORS Setup
    if (event.httpMethod === 'OPTIONS') { return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', }, body: '', }; }
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json', };

    // --- 1. KEY VALIDATION (7 Environment Variables) ---
    const geminiApiKey = process.env.LEAD_QUALIFIER_API_KEY;
    const masterSearchKey = process.env.RYGUY_SEARCH_API_KEY;
    const b2bPainCseId = process.env.B2B_PAIN_CSE_ID;
    const corpCompCseId = process.env.CORP_COMP_CSE_ID;
    const techSimCseId = process.env.TECH_SIM_CSE_ID;
    const socialProCseId = process.env.SOCIAL_PRO_CSE_ID;
    const dirInfoCseId = process.env.DIR_INFO_CSE_ID;
    
    if (!geminiApiKey || !masterSearchKey || !b2bPainCseId || !corpCompCseId || !techSimCseId || !socialProCseId || !dirInfoCseId) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: "Server Error: Missing one or more required Google API/CSE variables. Please ensure all seven are set in Netlify." }), };
    }

    let requestData;
    try { requestData = JSON.parse(event.body); } catch (e) { return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON body provided." }), }; }
    
    // CRITICAL FIX: Extract 'mode' from the request body
    const { userPrompt, responseSchema, systemInstruction, mode } = requestData;

    // --- 2. ORCHESTRATION: 5 Parallel Specialized Search Streams ---
    let searchPromises = [];
    let aggregatedSearchEvidence;

    if (mode === 'b2c') {
        // --- B2C MODE CONFIGURATION ---
        // The userPrompt contains the high-intent consumer filter phrase.
        // We repurpose the B2B CSE IDs but use B2C-focused keywords for forum and social sites.
        
        searchPromises = [
            // 1. B2C Forum/Review (Repurposing B2B_PAIN_CSE_ID for consumer pain)
            runCustomSearch(userPrompt, masterSearchKey, b2bPainCseId, 'B2C_FORUM_REVIEW', 'site:reddit.com OR site:quora.com OR "best reviews" OR "need advice" OR complaint'),
            
            // 2. B2C Scam/Complaint Check (Repurposing CORP_COMP_CSE_ID for consumer trust)
            runCustomSearch(userPrompt, masterSearchKey, corpCompCseId, 'B2C_SCAM_CHECK', 'scam OR complaint OR lawsuit OR BBB review OR trustpilot'),
            
            // 3. B2C Product Comparison (Repurposing TECH_SIM_CSE_ID for comparison shopping)
            runCustomSearch(userPrompt, masterSearchKey, techSimCseId, 'B2C_COMPARISON', '"vs" OR "compare prices" OR "alternatives" OR "best deal on"'),
            
            // 4. B2C Social/Local (Repurposing SOCIAL_PRO_CSE_ID for local and life events)
            runCustomSearch(userPrompt, masterSearchKey, socialProCseId, 'B2C_SOCIAL_LOCAL', 'site:facebook.com OR "local recommendations" OR "just moved" OR "new parent"'),
            
            // 5. B2C Local Directory Info (Repurposing DIR_INFO_CSE_ID for service lookup)
            runCustomSearch(userPrompt, masterSearchKey, dirInfoCseId, 'B2C_LOCAL_INFO', 'local service provider OR phone number OR address OR pricing'),
        ];
        
        const [b2cForumData, b2cScamData, b2cCompareData, b2cSocialData, b2cLocalData] = await Promise.all(searchPromises);

        aggregatedSearchEvidence = `
        --- AGGREGATED SPECIALIZED EVIDENCE FOR B2C LEAD SCORING (MODE: B2C) ---
        
        [FORUM AND REVIEW EVIDENCE]
        ${b2cForumData}
        
        [SCAM AND COMPLAINT EVIDENCE]
        ${b2cScamData}
        
        [PRODUCT COMPARISON EVIDENCE]
        ${b2cCompareData}
        
        [SOCIAL AND LOCAL EVIDENCE]
        ${b2cSocialData}
        
        [LOCAL DIRECTORY INFO]
        ${b2cLocalData}
        
        --- END OF AGGREGATED EVIDENCE ---
        `;

    } else {
        // --- B2B MODE CONFIGURATION (Existing Logic) ---
        // userPrompt contains the Company Name.
        searchPromises = [
            runCustomSearch(userPrompt, masterSearchKey, b2bPainCseId, 'B2B_PAIN', 'reviews OR rating OR complaint'),
            runCustomSearch(userPrompt, masterSearchKey, corpCompCseId, 'CORP_COMP', 'SEC filing OR lawsuit OR fine OR M&A'),
            runCustomSearch(userPrompt, masterSearchKey, techSimCseId, 'TECH_SIM', 'using Salesforce OR Hubspot OR tech stack'),
            runCustomSearch(userPrompt, masterSearchKey, socialProCseId, 'SOCIAL_PRO', 'hiring OR expansion OR audience growth'),
            runCustomSearch(userPrompt, masterSearchKey, dirInfoCseId, 'DIR_INFO', 'phone number OR address OR service list'),
        ];

        const [b2bPainData, corpCompData, techSimData, socialProData, dirInfoData] = await Promise.all(searchPromises);
        
        aggregatedSearchEvidence = `
        --- AGGREGATED SPECIALIZED EVIDENCE FOR LEAD SCORING (MODE: B2B) ---
        
        [B2B AND PAIN EVIDENCE]
        ${b2bPainData}
        
        [CORPORATE AND COMPLIANCE EVIDENCE]
        ${corpCompData}
        
        [TECHNOLOGY SIMULATION EVIDENCE]
        ${techSimData}
        
        [PROFESSIONAL AND SOCIAL EVIDENCE]
        ${socialProData}
        
        [DIRECTORY AND INFO EVIDENCE]
        ${dirInfoData}
        
        --- END OF AGGREGATED EVIDENCE ---
        `;
    }

    // --- 3. CONSTRUCT GEMINI PAYLOAD (Evidence Synthesis) ---
    // The Gemini instruction is updated to acknowledge the mode change
    const finalSystemInstruction = SYSTEM_PROMPT_GUIDANCE + `\n\nOriginal User Instruction: ${systemInstruction}`;

    const geminiPayload = {
        contents: [
            {
                parts: [
                    { text: userPrompt }, // The original query
                    { text: aggregatedSearchEvidence } // The combined evidence block
                ]
            }
        ],

        // We explicitly DO NOT include the Google Search tool, forcing the LLM to use the provided evidence.
        systemInstruction: { parts: [{ text: finalSystemInstruction }] },
        
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: responseSchema
        }
    };
    
    // --- 4. CALL THE LEAD_QUALIFIER_API_KEY (Gemini) ---
    const apiCallUrl = `${GEMINI_API_URL_BASE}?key=${geminiApiKey}`;

    try {
        const response = await fetch(apiCallUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiPayload)
        });

        // The remaining logic handles errors and extracts the final JSON from the LLM response.
        const result = await response.json();
        
        if (!response.ok || result.error) {
            console.error("LLM API Error Details:", result.error);
            return { statusCode: response.status, headers, body: JSON.stringify({ error: `LLM API Error: ${response.statusText}`, details: result.error?.message || "Check LLM upstream API response."}), };
        }

        const candidate = result.candidates?.[0];
        if (candidate && candidate.content?.parts?.[0]?.text) {
            const jsonString = candidate.content.parts[0].text;
            const cleanJsonString = jsonString.replace(/^```json\s*|```\s*$/g, '').trim();

            const leads = JSON.parse(cleanJsonString);
            
            return { statusCode: 200, headers, body: JSON.stringify(leads), };
        } else {
            return { statusCode: 500, headers, body: JSON.stringify({ error: "LLM Response Failure: No structured content received." }), };
        }

    } catch (e) {
        // This catch handles critical errors like network issues or final JSON parsing errors.
        return { statusCode: 500, headers, body: JSON.stringify({ error: `An unexpected server or JSON parsing error occurred: ${e.message}` }), };
    }
};
