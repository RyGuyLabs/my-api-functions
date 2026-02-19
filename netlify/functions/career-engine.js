/**
 * RyGuyLabs - Career Alignment Engine
 * Version 2.6 - Universal Handshake & Logic Restoration
 */

exports.handler = async (event, context) => {
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json"
    };

    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 200, headers, body: "OK" };
    }

    try {
        const { hobbies, skills, talents, country } = JSON.parse(event.body);
        const apiKey = process.env.FIRST_API_KEY;

        if (!apiKey) {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: "Config Error", message: "API Key missing." })
            };
        }

        // Using v1 stable - most reliable for model availability
        const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

        const apiPayload = {
            contents: [{ 
                parts: [{ 
                    text: `SYSTEM: You are the RyGuyLabs Career Alignment Engine.
                    PRIME DIRECTIVE: Help users overcome social anxiety and fear. 
                    Schedules must be task-oriented. Money and progress are primary; sleep is secondary.

                    USER PROFILE:
                    Hobbies: ${hobbies}
                    Skills: ${skills}
                    Talents: ${talents}
                    Location: ${country}

                    TASK:
                    Align these traits to a high-performance career. Provide a roadmap focused on execution.

                    OUTPUT FORMAT:
                    Return ONLY a raw JSON object. No markdown, no "json" tags, no preamble.
                    {
                        "careerTitle": "string",
                        "alignmentScore": number,
                        "earningPotential": "string",
                        "attainmentPlan": ["string", "string", "string", "string"],
                        "reasoning": "string",
                        "searchKeywords": ["string", "string"]
                    }` 
                }] 
            }],
            generationConfig: {
                temperature: 0.8,
                maxOutputTokens: 1000
                // response_mime_type removed to prevent "Unknown name" 400 errors
            }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(apiPayload)
        });

        const result = await response.json();

        if (!response.ok) {
            console.error("Gemini Handshake Error:", JSON.stringify(result));
            return {
                statusCode: response.status,
                headers,
                body: JSON.stringify({ 
                    error: "Upstream Error", 
                    message: result.error?.message || "Google rejected the request payload." 
                })
            };
        }

        let rawContent = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
        
        // ROBUST JSON EXTRACTION: Finds the first { and last } to strip away any conversational junk
        const startBracket = rawContent.indexOf('{');
        const endBracket = rawContent.lastIndexOf('}');
        
        if (startBracket === -1 || endBracket === -1) {
            throw new Error("AI failed to return valid JSON structure.");
        }

        const jsonString = rawContent.substring(startBracket, endBracket + 1);
        const finalData = JSON.parse(jsonString);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(finalData)
        };

    } catch (error) {
        console.error("Critical Failure:", error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "Processing Error", message: error.message })
        };
    }
};
