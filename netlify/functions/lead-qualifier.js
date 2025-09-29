// Configuration for the Gemini API
const GEMINI_API_URL_BASE = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent";
const MODEL_NAME = "gemini-2.5-flash-preview-05-20"; // Supports JSON output
const CUSTOM_SEARCH_URL = "https://www.googleapis.com/customsearch/v1";

/**
 * Implements exponential backoff for API retries.
 * @param {Function} fn - The function to execute.
 * @param {number} maxRetries - Maximum number of retries.
 * @returns {Promise<any>}
 */
async function fetchWithBackoff(fn, maxRetries = 5) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === maxRetries - 1) {
                throw error;
            }
            const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

/**
 * Performs a custom Google search using provided API key and Engine ID.
 * @param {string} query - The search query.
 * @returns {Promise<Array<Object> | null>} Array of structured search results or null on error.
 */
async function googleSearch(query) {
    // The 'process' global object is typically available in Netlify/Lambda environments.
    const searchApiKey = process.env.RYGUY_SEARCH_API_KEY;
    const searchEngineId = process.env.RYGUY_SEARCH_ENGINE_ID;
    
    if (!searchApiKey || !searchEngineId) {
        console.warn("RYGUY_SEARCH_API_KEY or RYGUY_SEARCH_ENGINE_ID missing. Cannot perform custom search.");
        return null;
    }

    // Limit to 3 results for concise reporting
    const searchUrl = `${CUSTOM_SEARCH_URL}?key=${searchApiKey}&cx=${searchEngineId}&q=${encodeURIComponent(query)}&num=3`;

    try {
        const response = await fetch(searchUrl);
        if (!response.ok) {
            console.error(`Google Custom Search API failed with status ${response.status}`);
            return null;
        }
        const data = await response.json();
        
        if (data.items && data.items.length > 0) {
            return data.items.map(item => ({
                title: item.title,
                snippet: item.snippet,
                link: item.link
            }));
        }
        return [];

    } catch (e) {
        console.error("Error during Google Custom Search API call:", e);
        return null;
    }
}

// Define the required structure for the AI response
const responseSchema = {
    type: "OBJECT",
    properties: {
        report: {
            type: "STRING",
            description: "A Strategic Lead Summary (2-3 paragraphs) in Markdown. Analyze the match score, potential fit, and key risks/opportunities. Must use strong, bolded markdown formatting."
        },
        outreach: {
            type: "STRING",
            description: "A highly personalized, raw-text (no markdown) outreach email/message draft designed to engage the contact (lead.name, lead.role) based on company news/pains. Keep it concise."
        },
        predictive: {
            type: "STRING",
            description: "Predictive Insights & Strategy (3-5 bullet points in Markdown). What competitive pressures or industry shifts is the lead facing? Suggest 2-3 specific strategies for the sales rep."
        },
        questions: {
            type: "STRING",
            description: "Thought-Provoking Questions (3-5 questions in Markdown). Generate deep, insightful questions the rep can ask to uncover further pain and qualification details."
        },
        news: {
            // UPDATED: Now requires a structured array to include links
            type: "ARRAY",
            description: "An array of 3 structured news items. Each item must contain a 'summary' of the news and the 'uri' (link) sourced from the provided search context.",
            items: {
                type: "OBJECT",
                properties: {
                    summary: { type: "STRING", description: "A brief, cited summary of the news article." },
                    uri: { type: "STRING", description: "The direct URL (link) to the source." }
                },
                required: ["summary", "uri"]
            }
        }
    },
    required: ["report", "outreach", "predictive", "questions", "news"]
};

// Main Netlify handler function
exports.handler = async (event) => {
    // Standard CORS headers for all responses
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS', // <-- ADDED for Preflight
    };
    
    // ** CORS FIX: Handle the Preflight OPTIONS Request **
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200, // CRITICAL: Must return 200 OK status for preflight to succeed
            headers: corsHeaders,
            body: '',
        };
    }
    // ** END CORS FIX **
    
    // Check for required API Keys
    const apiKey = process.env.LEAD_QUALIFIER_API_KEY;
    const searchApiKey = process.env.RYGUY_SEARCH_API_KEY;
    const searchEngineId = process.env.RYGUY_SEARCH_ENGINE_ID;
    
    if (!apiKey) {
        console.error("LEAD_QUALIFIER_API_KEY not found in environment variables.");
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ error: "Configuration Error: Gemini API Key is missing." }),
        };
    }
    
    // Check for Custom Search Keys
    if (!searchApiKey || !searchEngineId) {
        console.error("RYGUY_SEARCH_API_KEY or RYGUY_SEARCH_ENGINE_ID not found in environment variables.");
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ error: "Configuration Error: Custom Search API credentials are missing." }),
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: corsHeaders,
            body: JSON.stringify({ error: "Method Not Allowed" }),
        };
    }

    let leadData, idealClient;

    // --- CRITICAL DEBUGGING STEP ADDED ---
    console.log('Received event body (raw):', event.body);
    // -------------------------------------
    
    try {
        // Netlify function event.body is a string, which needs to be parsed
        const body = JSON.parse(event.body);
        leadData = body.leadData;
        idealClient = body.idealClient;

        if (!leadData || !idealClient) {
            // Throw a specific error if the required top-level keys are missing
            throw new Error("Missing required leadData or idealClient payload in the parsed JSON body.");
        }
    } catch (e) {
        // This catch block handles both JSON parse failures AND missing keys
        console.error("Payload validation failed (400):", e.message, "Body was:", event.body ? event.body.substring(0, 200) : 'null/empty'); // Log error and snippet
        return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ error: "Invalid JSON payload format or missing required data.", details: e.message }),
        };
    }

    // --- 1. Perform Custom Search to Gather Context ---
    const companyQuery = `${leadData.company} financial news`; // Focused query for better results
    const searchResults = await googleSearch(companyQuery);
    
    let searchContext = "No real-time search context was available.";
    if (searchResults && searchResults.length > 0) {
        searchContext = "The following real-time news articles were found:\n";
        searchResults.forEach((item, index) => {
            // Pass the URL for the AI to include in the structured JSON output
            searchContext += `Article ${index + 1}: Title: "${item.title}", Snippet: "${item.snippet.replace(/\n/g, ' ')}", URL: "${item.link}"\n`;
        });
    }

    // --- 2. Construct the detailed prompt ---

    const userPrompt = `
        Analyze the following lead data against the Ideal Client Profile (ICP). 
        The lead's calculated match score is ${leadData.score}%.

        ***Ideal Client Profile (ICP)***
        - Target Industry: ${idealClient.industry}
        - Company Size: ${idealClient.size}
        - Revenue Range: ${idealClient.revenue}
        - Target Role: ${idealClient.role}
        - Key Challenges/Pains: ${idealClient.notes}

        ***Lead Information***
        - Contact Name: ${leadData.name}
        - Company: ${leadData.company}
        - Industry: ${leadData.industry}
        - Size: ${leadData.size}
        - Revenue: ${leadData.revenue}
        - Role: ${leadData.role}
        - Budget: ${leadData.budget}
        - Timeline: ${leadData.timeline}
        - Stated Needs/Pains: ${leadData.needs}

        ***Real-Time Search Context***
        Use the following search context to inform your report, especially the 'news' and 'outreach' sections.
        ${searchContext}

        Generate a comprehensive, actionable sales report in the required JSON structure. 
        Crucially, the 'news' field MUST be an array of 3 objects based on the provided search context. Each object MUST contain a 'summary' of the news and the direct 'uri' (URL) from the search results. DO NOT USE MARKDOWN in the news array summaries.
    `;
    
    // --- 3. Construct the API Payload ---

    const payload = {
        contents: [{ parts: [{ text: userPrompt }] }],
        
        // Enforce JSON output and define the structure
        // FIX: Renaming 'config' to 'generationConfig' to comply with Gemini API structure
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: responseSchema
        },
        
        // Set the persona for the model
        systemInstruction: {
            parts: [{ text: "You are a world-class, hyper-efficient Sales Development Representative (SDR) AI Analyst. Your goal is to generate an immediate, comprehensive, and highly-actionable qualification and strategy report for a sales professional based on lead data and real-time context. The output must strictly adhere to the exact JSON format requested." }]
        }
    };

    // --- 4. Call the Gemini API with Backoff ---
    
    const apiUrl = `${GEMINI_API_URL_BASE}?key=${apiKey}`;

    try {
        const result = await fetchWithBackoff(async () => {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                let errorBody = await response.text();
                try { errorBody = JSON.parse(errorBody); } catch (e) { /* ignore parse error */ }
                
                console.error("Gemini API Error:", response.status, errorBody);

                return {
                    statusCode: response.status,
                    headers: corsHeaders,
                    body: JSON.stringify({ 
                        error: `Gemini API failed with status ${response.status}.`, 
                        report: `**Error:** API call failed. Status: ${response.status}. Details: ${typeof errorBody === 'object' ? JSON.stringify(errorBody) : errorBody}` 
                    })
                };
            }

            return await response.json();
        });

        if (result.statusCode) {
            return result;
        }

        const candidate = result.candidates?.[0];

        if (candidate && candidate.content?.parts?.[0]?.text) {
            const jsonText = candidate.content.parts[0].text;
            let reportData;
            
            try {
                reportData = JSON.parse(jsonText);
            } catch (parseError) {
                console.error("Failed to parse JSON response from Gemini:", jsonText, parseError);
                return {
                    statusCode: 500,
                    headers: corsHeaders,
                    body: JSON.stringify({ 
                        error: "Failed to parse AI-generated report.", 
                        report: `**Fatal Error:** The AI model returned invalid JSON. Please check the model output. Raw output: ${jsonText.substring(0, 500)}...` 
                    })
                };
            }

            // Success response
            return {
                statusCode: 200,
                headers: { 
                    'Content-Type': 'application/json',
                    ...corsHeaders
                },
                body: JSON.stringify(reportData)
            };
        } else {
            console.error("Gemini response missing content:", result);
            return {
                statusCode: 500,
                headers: corsHeaders,
                body: JSON.stringify({ 
                    error: "AI response was empty or malformed.", 
                    report: "**Fatal Error:** The AI did not return a valid content block." 
                })
            };
        }

    } catch (e) {
        console.error("Unhandled network or general error:", e);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ 
                error: "Internal Server Error during fetch process.", 
                report: `**Fatal Error:** Network or internal process failed. Details: ${e.message}`
            }),
        };
    }
};
