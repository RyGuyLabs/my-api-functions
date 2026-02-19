/**
 * RyGuyLabs - Career Alignment Engine
 * Version 2.5 - Stable v1 Handshake + Logic Restoration
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
                body: JSON.stringify({ error: "Config Error", message: "API Key missing in Netlify environment." })
            };
        }

        // STABLE v1 URL
        const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

        const apiPayload = {
            contents: [{ 
                parts: [{ 
                    text: `SYSTEM: You are the RyGuyLabs Career Alignment Engine. 
                    PRIME DIRECTIVE: Help users overcome social anxiety and fear to achieve their high-performance dreams. 
                    
                    USER DATA:
                    Hobbies: ${hobbies}
                    Skills: ${skills}
                    Talents: ${talents}
                    Location: ${country}

                    TASK:
                    1. Identify a career path that aligns these traits.
                    2. Calculate an Alignment Score based on trait synergy.
                    3. Provide a task-oriented Attainment Roadmap where money and progress are primary.
                    4. Address potential fears/anxieties with logical reasoning.

                    RETURN ONLY VALID JSON:
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
                temperature: 0.7,
                // Fixed the v1 field name from responseMimeType to response_mime_type
                response_mime_type: "application/json"
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
                    error: "Upstream Logic Error", 
                    message: result.error?.message || "Connection succeeded but request was rejected." 
                })
            };
        }

        let rawContent = result.candidates?.[0]?.content?.parts?.[0]?.text;
        
        // Final safety check for JSON parsing
        const finalData = typeof rawContent === 'string' ? JSON.parse(rawContent) : rawContent;

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(finalData)
        };

    } catch (error) {
        console.error("Critical Function Failure:", error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "Processing Error", message: error.message })
        };
    }
};
