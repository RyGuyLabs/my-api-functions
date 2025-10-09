/**
 * Netlify Function: generate-leads
 * * This function processes a POST request from the front-end form,
 * constructs a targeted prompt based on quality/volume parameters,
 * and calls the Gemini API with Google Search grounding to generate
 * a structured list of leads (companies).
 * * To deploy: Save this file at 'netlify/functions/generate-leads.js'
 * * ENVIRONMENT VARIABLE REQUIRED:
 * - LEAD_QUALIFIER_API_KEY: Your Google AI API key. (Set this in Netlify UI)
 * * NOTE: This function utilizes Gemini's built-in Google Search grounding. 
 * External search keys (like RYGUY_SEARCH_API_KEY) are NOT used here.
 */

const { GoogleGenAI } = require('@google/genai');

// NOTE: Netlify automatically makes environment variables available
// The API Key is fetched from the environment variable provided by the user.
const LEAD_QUALIFIER_API_KEY = process.env.LEAD_QUALIFIER_API_KEY || "";
const ai = new GoogleGenAI(LEAD_QUALIFIER_API_KEY);

/**
 * Defines the required structure for the lead data output.
 * We use a JSON schema to force the model to return a predictable array of leads.
 */
const leadSchema = {
    type: "ARRAY",
    description: "A list of high-quality sales leads based on the user's criteria.",
    items: {
        type: "OBJECT",
        properties: {
            companyName: {
                type: "STRING",
                description: "The full, professional name of the company."
            },
            website: {
                type: "STRING",
                description: "The root URL of the company website. Should start with http:// or https://."
            },
            contactEmail: {
                type: "STRING",
                description: "A primary contact email address (e.g., info@, sales@). Use 'N/A' if unable to find a specific contact."
            },
            confidenceScore: {
                type: "STRING",
                description: "A subjective quality score for the lead based on search results (High, Medium, Low)."
            }
        },
        required: ["companyName", "website", "contactEmail", "confidenceScore"]
    }
};

/**
 * Builds the prompt and system instruction based on the user's chosen quality level.
 * @param {string} industry - The target industry.
 * @param {string} searchQuery - The specific keyword/query.
 * @param {string} qualityLevel - 'low', 'medium', or 'high'.
 * @param {number} maxLeads - Maximum number of leads requested (1-100).
 * @returns {{systemInstruction: string, userQuery: string}}
 */
function buildPrompt(industry, searchQuery, qualityLevel, maxLeads) {
    let systemInstruction = `You are an expert lead generation specialist. Your task is to perform an internet search based on the user's query and strictly return a JSON array of ${maxLeads} leads. You MUST ONLY return valid JSON that conforms exactly to the provided schema. Do not include any explanatory text, markdown notes, or code fences (e.g., \`\`\`).`;

    let userQuery = "";
    
    // Adjust the query complexity based on the quality level
    switch (qualityLevel) {
        case 'low':
            // High Volume, Broad Search
            userQuery = `Find up to ${maxLeads} diverse companies in the '${industry}' sector matching the broad term '${searchQuery}'. Prioritize quantity and speed. Focus on extracting just the company name and website.`;
            break;
        case 'high':
            // Low Volume, Niche Search, High Filter
            userQuery = `Find the highest quality, most specific, and relevant companies (up to ${maxLeads}) in the '${industry}' sector matching the niche term '${searchQuery}'. You must attempt to find a verifiable contact email and provide a high confidence score only for exceptionally relevant results.`;
            systemInstruction += " Be highly selective and apply strict filters. If a required field cannot be found, use 'N/A' but try hard to find it."
            break;
        case 'medium':
        default:
            // Balanced Approach
            userQuery = `Find a balanced set of up to ${maxLeads} relevant companies in the '${industry}' sector matching the query '${searchQuery}'. Include website and attempt to find a primary contact email.`;
            break;
    }
    
    return { systemInstruction, userQuery };
}

/**
 * The main handler for the Netlify Function.
 */
exports.handler = async (event) => {
    // 1. Basic CORS headers for external access (SQUARESACE/ANY ORIGIN)
    // Using '*' here ensures the header is definitely returned, overriding potential
    // Netlify environment/caching issues with specific domains.
    const headers = {
        'Access-Control-Allow-Origin': '*', // FIXED: Using wildcard as the last resort to ensure the header is returned
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400', 
        'Content-Type': 'application/json',
    };

    // Handle CORS preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ message: 'CORS check successful' }),
        };
    }
    
    // Ensure it's a POST request and has a body
    if (event.httpMethod !== 'POST' || !event.body) {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ message: 'Method Not Allowed or Missing Body' }),
        };
    }

    // 2. Parse and Validate Input
    let data;
    try {
        data = JSON.parse(event.body);
    } catch (error) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ message: 'Invalid JSON payload' }),
        };
    }

    const { industry, search_query, quality_level, max_leads } = data;

    if (!industry || !search_query || !quality_level || !max_leads) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ message: 'Missing required fields: industry, search_query, quality_level, and max_leads are required.' }),
        };
    }
    
    // Using the new ENV variable name
    if (!LEAD_QUALIFIER_API_KEY) {
         return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ message: 'Server configuration error: LEAD_QUALIFIER_API_KEY is missing.' }),
        };
    }

    // 3. Construct Prompt and API Payload
    const { systemInstruction, userQuery } = buildPrompt(industry, search_query, quality_level, max_leads);
    
    const payload = {
        contents: [{ parts: [{ text: userQuery }] }],
        
        // Use Google Search for lead generation grounding
        tools: [{ google_search: {} }],
        
        // Define the AI's persona and rules
        systemInstruction: { parts: [{ text: systemInstruction }] },
        
        // Define the required JSON output format
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: leadSchema
        }
    };
    
    // 4. Call Gemini API with Exponential Backoff
    let response;
    const maxRetries = 3;
    let lastError = null;

    for (let i = 0; i < maxRetries; i++) {
        try {
            // Using gemini-2.5-flash-preview-05-20 for structured, grounded responses
            response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-preview-05-20',
                payload: payload
            });
            break; // Success! Exit loop.
        } catch (error) {
            lastError = error;
            if (i < maxRetries - 1) {
                const delay = Math.pow(2, i) * 1000; // 1s, 2s, 4s delay
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    if (!response) {
        console.error('Final API Error after retries:', lastError);
        return {
            statusCode: 503,
            headers,
            body: JSON.stringify({ message: 'Failed to generate leads due to API or network error after multiple retries.', error: lastError.message }),
        };
    }
    
    // 5. Process and Return Response
    try {
        const jsonText = response.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!jsonText) {
             return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ message: 'AI model returned an unexpected or empty response.' }),
            };
        }
        
        // The model should return raw JSON text due to the configuration
        const leadsData = JSON.parse(jsonText);
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
                message: 'Leads generated successfully.', 
                data: leadsData,
                // Optionally include grounding sources metadata here if needed for debugging
            }),
        };

    } catch (error) {
        console.error('Error processing AI response:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                message: 'Error processing AI response into final JSON.', 
                raw_response: response.candidates?.[0]?.content?.parts?.[0]?.text,
                error: error.message
            }),
        };
    }
};
