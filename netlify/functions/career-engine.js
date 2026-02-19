/**
 * RyGuyLabs - Career Alignment Engine
 * Version 2.4 - Stable v1 API Route
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

        // Switching to the STABLE v1 API to ensure model 'gemini-1.5-flash' is found
        const baseUrl = "https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent";
        const url = `${baseUrl}?key=${apiKey}`;

        const apiPayload = {
            contents: [{ 
                parts: [{ 
                    text: `Identify a high-performance career for this profile:
                    Hobbies: ${hobbies}
                    Skills: ${skills}
                    Talents: ${talents}
                    Location: ${country}

                    Return ONLY a VALID JSON object (no markdown, no backticks):
                    {
                        "careerTitle": "string",
                        "alignmentScore": number,
                        "earningPotential": "string",
                        "attainmentPlan": ["step 1", "step 2", "step 3"],
                        "reasoning": "string",
                        "searchKeywords": ["keyword1", "keyword2"]
                    }` 
                }] 
            }],
            generationConfig: {
                temperature: 0.7,
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
            console.error("Gemini Error:", JSON.stringify(result));
            return {
                statusCode: response.status,
                headers,
                body: JSON.stringify({ 
                    error: "Upstream API Error", 
                    message: result.error?.message || "Google API connection failed." 
                })
            };
        }

        const rawContent = result.candidates?.[0]?.content?.parts?.[0]?.text;
        
        // Handle potential string vs object returns
        const finalData = typeof rawContent === 'string' ? JSON.parse(rawContent) : rawContent;

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(finalData)
        };

    } catch (error) {
        console.error("Fatal Error:", error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "Processing Error", message: error.message })
        };
    }
};
