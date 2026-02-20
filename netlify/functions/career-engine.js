/**
 * RyGuyLabs - Career Alignment Engine
 * Version 2.8 - Restored Logic & Enhanced Stability
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

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

        const apiPayload = {
            contents: [{ 
                parts: [{ 
                    text: `SYSTEM: You are the RyGuyLabs Career Alignment Engine.
                    PRIME DIRECTIVE: Help users overcome social anxiety and fear to achieve high-performance dreams. 
                    SCHEDULE RULES: Entirely task-oriented. Money and progress are primary; sleep is secondary. No wind-down time.

                    USER DATA:
                    Hobbies: ${hobbies}
                    Skills: ${skills}
                    Talents: ${talents}
                    Location: ${country}

                    TASK:
                    Align these traits to a high-performance career. Return a JSON object ONLY.

                    FORMAT:
                    {
                        "careerTitle": "string",
                        "alignmentScore": number,
                        "earningPotential": "string",
                        "attainmentPlan": ["step 1", "step 2", "step 3", "step 4"],
                        "reasoning": "string",
                        "searchKeywords": ["keyword1", "keyword2"]
                    }` 
                }] 
            }],
            generationConfig: {
                temperature: 0.8,
                responseMimeType: "application/json"
            }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(apiPayload)
        });

        const result = await response.json();

        if (!response.ok) {
            return {
                statusCode: response.status,
                headers,
                body: JSON.stringify({ 
                    error: "Upstream Error", 
                    message: result.error?.message || "Google API handshake failed." 
                })
            };
        }

        let rawContent = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
        
        // Extraction logic to handle potential markdown wrappers
        const start = rawContent.indexOf('{');
        const end = rawContent.lastIndexOf('}');
        if (start === -1 || end === -1) throw new Error("Invalid AI Response Format");
        
        const jsonString = rawContent.substring(start, end + 1);
        const parsedData = JSON.parse(jsonString);

        // PRODUCTION GUARD: Ensure all arrays exist to prevent frontend .map() crashes
        const finalData = {
            careerTitle: parsedData.careerTitle || "High Performance Role",
            alignmentScore: parsedData.alignmentScore || 85,
            earningPotential: parsedData.earningPotential || "Premium",
            attainmentPlan: Array.isArray(parsedData.attainmentPlan) ? parsedData.attainmentPlan : ["Execution Phase 1", "Market Entry"],
            reasoning: parsedData.reasoning || "Optimized for your specific skill synthesis.",
            searchKeywords: Array.isArray(parsedData.searchKeywords) ? parsedData.searchKeywords : ["Career"]
        };

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(finalData)
        };

    } catch (error) {
        console.error("Internal Failure:", error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "Processing Error", message: error.message })
        };
    }
};
