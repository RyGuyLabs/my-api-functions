/**
 * Conceptual logic for the Netlify serverless function 'generate-leads'.
 *
 * FIX: This logic removes the unsupported combination of 'tools' (for Google Search)
 * and 'responseSchema' (for structured JSON). Instead, it uses a detailed
 * system instruction to force the model to output a raw JSON string, which is then
 * manually parsed before being returned to the client.
 */

// NOTE: Ensure your Netlify environment variables are correctly loaded.
const GEMINI_API_KEY = process.env.RYGUY_SEARCH_API_KEY;
const API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODEL_NAME = 'gemini-2.5-flash-preview-05-20'; // Using the recommended flash model

exports.handler = async (event) => {
    // 1. Validate incoming client request
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    // Handle OPTIONS preflight request for CORS
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            },
            body: '',
        };
    }

    try {
        const { leadType, searchTerm, location, financialTerm } = JSON.parse(event.body);

        // Validate required input fields
        if (!leadType || !searchTerm || !location) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: "Missing required parameters: leadType, searchTerm, or location." })
            };
        }

        // 2. Construct the prompt for the model
        const userQuery = `Generate exactly 3 high-quality leads for a ${leadType} sales campaign.
        Target profile: ${searchTerm}.
        Target location: ${location}.
        ${leadType === 'residential' ? `Financial filter: ${financialTerm}` : ''}
        Provide the output as a single, valid JSON array that strictly adheres to the schema provided in the system instruction.`;

        // 3. Define the System Instruction (the key fix for structured output + tool use)
        const systemInstruction = `You are an expert Lead Generation analyst using Google Search for real-time data.
        Your response MUST be a single, valid JSON array containing exactly 3 objects.
        Do NOT include any surrounding text, comments, or markdown ticks (e.g., \`\`\`) in your final output.

        The JSON structure MUST conform to this schema:
        [
          {
            "name": "string (Company or Individual Name)",
            "description": "string (1-2 sentence description of the lead)",
            "website": "string (Full URL found via search, must include http/https)",
            "email": "string (A plausible, inferred or found contact email)",
            "phoneNumber": "string (A plausible, inferred or found phone number)",
            "qualityScore": "string (High, Medium, or Low, based on fit to query)",
            "insights": "string (Explain why this lead is valuable and current)",
            "suggestedAction": "string (Immediate next step for a salesperson, e.g., 'Draft email based on X news.')",
            "draftPitch": "string (A short, personalized 2-sentence draft pitch)",
            "socialSignal": "string (Latest relevant public activity or news)"
          }
          // ... two more objects
        ]
        `;

        // 4. Construct the API Payload
        const payload = {
            contents: [{ parts: [{ text: userQuery }] }],
            // Include the search tool for grounding
            tools: [{ "google_search": {} }],
            // Include the system instruction for formatting
            systemInstruction: { parts: [{ text: systemInstruction }] },
            // ADDED: Configuration to improve generation speed and reduce timeout risk
            generationConfig: {
                temperature: 0.2, // Lower temperature for direct, less exploratory answers
                maxOutputTokens: 2048, // Limit token count to ensure faster response
            }
        };

        // 5. Call the Gemini API (Assumes global fetch is available, typical in Node 18+ environments)
        const response = await fetch(`${API_BASE_URL}/${MODEL_NAME}:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const result = await response.json();

        if (!response.ok) {
            // Handle API error response
            console.error("Gemini API Error:", result);
            return {
                statusCode: result.error?.code || 500,
                body: JSON.stringify({ error: "Failed to communicate with the Gemini API.", details: JSON.stringify(result) }),
            };
        }

        // 6. Extract and MANUALLY Parse the raw text output
        const rawJsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!rawJsonText) {
             return {
                statusCode: 500,
                body: JSON.stringify({ error: "Gemini response was empty or malformed." }),
            };
        }

        // CRITICAL FIX: Strip markdown code block wrappers (```json\n...\n```) from the output.
        // This makes the code resilient to the LLM including the wrapper despite instructions.
        let cleanJsonText = rawJsonText.trim();
        const jsonWrapperRegex = /^```json\s*|^\s*```\s*|^\s*```\s*json\s*|\s*```\s*$/gmi;
        cleanJsonText = cleanJsonText.replace(jsonWrapperRegex, '').trim();

        let leadsArray;

        // CRITICAL FIX: Add try...catch around JSON.parse for model output resilience
        try {
            leadsArray = JSON.parse(cleanJsonText);
        } catch (parseError) {
             console.error("JSON Parsing Error:", parseError.message, "Raw Text:", rawJsonText); // Use rawJsonText for better debugging context
             return {
                statusCode: 500,
                body: JSON.stringify({ 
                    error: "Failed to parse JSON response from the language model. The model did not return perfect JSON.", 
                    details: parseError.message,
                    rawOutput: rawJsonText // Return the raw output to help debug the model's failure
                }),
            };
        }
        
        // Optional: Validate the returned array structure
        if (!Array.isArray(leadsArray) || leadsArray.length !== 3) {
            console.error("AI did not return exactly 3 leads or structure is incorrect. Array Length:", leadsArray ? leadsArray.length : 0);
            return {
                statusCode: 500,
                body: JSON.stringify({ error: "AI did not return exactly 3 leads as expected, or the array structure is incorrect.", rawOutput: rawJsonText })
            };
        }

        // 7. Success: Return the parsed leads array to the client
        return {
            statusCode: 200,
            headers: { 
                'Content-Type': 'application/json',
                // This header is required if you remove the proxy on the client side later
                'Access-Control-Allow-Origin': '*' 
            },
            body: JSON.stringify({ leads: leadsArray }),
        };

    } catch (error) {
        console.error("Serverless Function Error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: `Internal Server Error: ${error.message}` }),
        };
    }
};
