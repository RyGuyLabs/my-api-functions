// Netlify Serverless Function to securely call the Gemini API
// This function handles the API key and environment setup.

// CRITICAL FIX 3B: Use dynamic import for fetch to avoid Node dependency issues
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const GEMINI_API_KEY = process.env.LEAD_QUALIFIER_API_KEY;
const MODEL_NAME = "gemini-2.5-flash-preview-05-20";

exports.handler = async (event, context) => {
    // Check for API key presence
    if (!GEMINI_API_KEY) {
        console.error("LEAD_QUALIFIER_API_KEY environment variable is not set.");
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Server configuration error: API key missing." }),
        };
    }

    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: "Method Not Allowed" };
    }
    
    let params;
    try {
        // Parse parameters sent from the client-side HTML
        params = JSON.parse(event.body);
    } catch (error) {
        return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body provided." }) };
    }

    const { leadType, searchTerm, location, financialTerm } = params;

    // CRITICAL FIX 2: Validate incoming parameters
    if (!leadType || !searchTerm || !location) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: "Missing required parameters (leadType, searchTerm, or location)." }),
        };
    }

    // --- Gemini API Configuration ---

    const systemPrompt = `You are a specialized, top-tier Sales Intelligence Analyst and Lead Generator. Your goal is to produce leads that are high-quality, validated, and distinctive from common database entries, adding next-level value for the consumer.
        Your task is to take the user's input (Lead Type, Search Term, Location, and Financial Term) and use Google Search to find prospects.
        
        You must generate exactly 3 highly qualified leads based on the user's criteria. 
        Each lead MUST include:
        1. A verifiable trigger event or signal sourced from search results (e.g., funding round, new leadership, significant expansion, major financial event).
        2. A justification referencing that trigger.
        3. A suggested outreach strategy tied directly to that signal.
        If a lead cannot be validated by a real-world triggering event, replace it with a stronger one. 

        For each lead, provide a name, brief description, **realistic or scraped contact information whenever possible. If unavailable, provide the closest inferred domain and role-based email (e.g., info@company.com).** Provide a QualityScore (High, Medium, or Low) based only on the **strength and recency of the validation signal**. 
        
        The output MUST include: key insights justifying the lead quality, a clear suggested action, a brief draft pitch tailored to the validation signal, and a highly specific social signal/trigger event found via search.
        
        The response MUST be a JSON object containing a 'leads' array following the provided schema. Do not include any text outside the JSON block.
        The search query must combine all provided user criteria to ensure precision.`;

    const userQuery = `Generate 3 leads for a "${leadType}" prospect, matching the search term: "${searchTerm}" in the location: "${location}". 
        If the lead type is "residential", also consider the financial term: "${financialTerm}".`; // CRITICAL FIX 2: Changed '===' to 'is'

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${GEMINI_API_KEY}`;

    const payload = {
        contents: [{ parts: [{ text: userQuery }] }],
        tools: [{ "google_search": {} }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                properties: {
                    leads: {
                        type: "ARRAY",
                        description: "A list of exactly three generated leads.",
                        items: {
                            type: "OBJECT",
                            properties: {
                                name: { type: "STRING" },
                                description: { type: "STRING" },
                                website: { type: "STRING" },
                                email: { type: "STRING" },
                                phoneNumber: { type: "STRING" },
                                qualityScore: { type: "STRING", enum: ["High", "Medium", "Low"] },
                                insights: { type: "STRING" },
                                suggestedAction: { type: "STRING" },
                                draftPitch: { type: "STRING" },
                                socialSignal: { type: "STRING" },
                            },
                        }
                    }
                }
            }
        }
    };

    try {
        // 1. Call Gemini API
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            console.error(`Gemini API HTTP Error: ${response.status} - ${response.statusText}`);
            // Attempt to read error body if available
            const errorBody = await response.text();
            console.error('Gemini Error Body:', errorBody);
            return {
                statusCode: response.status,
                body: JSON.stringify({ error: "Failed to communicate with the Gemini API.", details: errorBody }),
            };
        }

        // 2. Process Response
        const result = await response.json();
        let jsonString = result.candidates?.[0]?.content?.parts?.[0]?.text;

        // CRITICAL FIX 6: Defensive JSON Parsing
        if (!jsonString) {
            console.error("Received an empty response from the AI.");
            return { statusCode: 500, body: JSON.stringify({ error: "AI returned an empty response." }) };
        }

        // Clean up markdown wrappers (```json, ```) which Gemini sometimes adds
        jsonString = jsonString.replace(/```json|```/g, '').trim();
        
        let parsedResult;
        try {
            parsedResult = JSON.parse(jsonString);
        } catch (err) {
            console.error("Bad JSON from AI:", jsonString);
            return { statusCode: 500, body: JSON.stringify({ error: "Failed to parse JSON from AI.", details: err.message }) };
        }
        
        // CRITICAL FIX 5: Sort leads by value (High > Medium > Low)
        const scoreMap = { High: 3, Medium: 2, Low: 1 };
        const rankedLeads = parsedResult.leads.sort((a, b) => {
            // Sorts in descending order of quality score
            return scoreMap[b.qualityScore] - scoreMap[a.qualityScore];
        });

        // 3. Return the ranked leads array
        return {
            statusCode: 200,
            body: JSON.stringify(rankedLeads), // Return the array of leads
        };

    } catch (error) {
        console.error('Serverless function execution error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Internal Server Error during AI processing.", details: error.message }),
        };
    }
};
