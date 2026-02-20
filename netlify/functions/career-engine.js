/**
 * RyGuyLabs - Career Alignment Engine
 * Version 5.0 - Full Logic Restoration + CAREER_BUILD_KEY
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
        const apiKey = process.env.CAREER_BUILD_KEY;

        if (!apiKey) {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: "Config Error", message: "CAREER_BUILD_KEY is missing." })
            };
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

        const apiPayload = {
            contents: [{ 
                parts: [{ 
                    text: `SYSTEM: You are the RyGuyLabs Career Alignment Engine.
                    PRIME DIRECTIVE: Help users overcome social anxiety and fear to achieve high-performance dreams. 
                    CORE RULES: Entirely task-oriented. Money and progress are primary; sleep is secondary. No wind-down time. Execution is the only priority.

                    USER DATA:
                    Hobbies: ${hobbies}
                    Skills: ${skills}
                    Talents: ${talents}
                    Location: ${country}

                    TASK:
                    1. Align these traits to a specific high-performance career.
                    2. Provide an attainment roadmap (4 steps) where execution is the only focus.
                    3. Address how this path specifically bypasses their social anxieties through logical progress.
                    
                    OUTPUT: Return ONLY a raw JSON object:
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
                temperature: 0.85,
                topP: 0.95
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
                body: JSON.stringify({ error: "Upstream Error", message: result.error?.message })
            };
        }

        const rawContent = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const start = rawContent.indexOf('{');
        const end = rawContent.lastIndexOf('}');
        
        if (start === -1 || end === -1) throw new Error("AI failed to return valid JSON.");
        
        const jsonString = rawContent.substring(start, end + 1);
        const finalData = JSON.parse(jsonString);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(finalData)
        };

    } catch (error) {
        console.error("Function Failure:", error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "Processing Error", message: error.message })
        };
    }
};
