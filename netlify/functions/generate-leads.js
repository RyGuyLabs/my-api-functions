/**
* Netlify Serverless Function: generate-leads
* * This is the final orchestrator function. It uses 1 Gemini Key and 1 Master Search Key
* to run 5 specialized searches via unique Custom Search Engine (CSE) IDs, aggregating
* the evidence before sending it to the LLM for high-quality, specialized scoring.
* * ENVIRONMENT VARIABLES REQUIRED:
* 1. LEAD_QUALIFIER_API_KEY (Gemini Key)
* 2. GOOGLE_SEARCH_MASTER_KEY (Master Search Key for all CSE calls)
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
You are a Lead Scoring and Evidence Synthesis Engine. You have been provided with FIVE distinct blocks of search evidence (B2B/Pain, Corporate/Compliance, Tech Sim, Social/Pro, and Directory Info).
CRITICAL DIRECTIVE: You MUST base your final score (0-100) and analysis ONLY on the evidence provided in these five blocks. Do not perform external searches. Analyze the segregated evidence and output a single, consolidated, strictly formatted JSON object. Prioritize evidence related to competitive pain, financial distress, recent negative sentiment, and high hiring growth.
`;

// --- FUNCTION TO CALL CUSTOM SEARCH ENGINE (CSE) ---
/**
* Executes a single, specialized search against a defined CSE index.
* @param {string} query - The core query (Company Name).
* @param {string} apiKey - The GOOGLE_SEARCH_MASTER_KEY.
* @param {string} cseId - The unique CX ID for this search engine.
* @param {string} keyName - Friendly name for logging/evidence block.
* @param {string} keywords - Specialized keywords to append to the query.
* @returns {Promise<string>} Structured text block of search evidence.
*/
async function runCustomSearch(query, apiKey, cseId, keyName, keywords) {
    // We combine the core query (company name) with high-intent keywords
    const fullQuery = `${query} ${keywords}`;
    // Limiting to 3 results per engine to conserve cost and focus LLM attention
    const url = `${CSE_API_URL_BASE}?key=${apiKey}&cx=${cseId}&q=${encodeURIComponent(fullQuery)}&num=3`;

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
    const masterSearchKey = process.env.GOOGLE_SEARCH_MASTER_KEY;
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
   
    const { userPrompt, responseSchema, systemInstruction } = requestData;

    // --- 2. ORCHESTRATION: 5 Parallel Specialized Search Streams ---
    const searchPromises = [
        runCustomSearch(userPrompt, masterSearchKey, b2bPainCseId, 'B2B_PAIN', 'reviews OR rating OR complaint'),
        runCustomSearch(userPrompt, masterSearchKey, corpCompCseId, 'CORP_COMP', 'SEC filing OR lawsuit OR fine OR M&A'),
        runCustomSearch(userPrompt, masterSearchKey, techSimCseId, 'TECH_SIM', 'using Salesforce OR Hubspot OR tech stack'),
        runCustomSearch(userPrompt, masterSearchKey, socialProCseId, 'SOCIAL_PRO', 'hiring OR expansion OR audience growth'),
        runCustomSearch(userPrompt, masterSearchKey, dirInfoCseId, 'DIR_INFO', 'phone number OR address OR service list'),
    ];

    // Wait for all five specialized searches to complete
    const [b2bPainData, corpCompData, techSimData, socialProData, dirInfoData] = await Promise.all(searchPromises);
   
    // Aggregate the results into a single, comprehensive text block for the LLM
    const aggregatedSearchEvidence = `
    --- AGGREGATED SPECIALIZED EVIDENCE FOR LEAD SCORING ---
   
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

    // --- 3. CONSTRUCT GEMINI PAYLOAD (Evidence Synthesis) ---
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
        return { statusCode: 500, headers, body: JSON.stringify({ error: `An unexpected server or JSON parsing error occurred: ${e.message}` }), };
    }
};
