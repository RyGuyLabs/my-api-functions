/**
 * RyGuyLabs - Career Alignment Engine
 * Version 2.3 - Model Identifier Fix (404 Resolved)
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

        // Updated Model String to 'gemini-1.5-flash-latest' which is the standard for v1beta
        const modelId = "gemini-1.5-flash-latest";
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

        const apiPayload = {
            contents: [{ 
                parts: [{ 
                    text: `Identify a high-performance career for this profile:
                    Hobbies: ${hobbies}
                    Skills: ${skills}
                    Talents: ${talents}
                    Location: ${country}

                    Return a VALID JSON object exactly like this:
                    {
                        "careerTitle": "string",
                        "alignmentScore": number,
                        "earningPotential": "string",
                        "attainmentPlan": ["step 1", "step 2", "step 3"],
                        "reasoning": "string",
                        "searchKeywords": ["keyword1", "keyword2"]
                    }
                    No conversational text. No markdown formatting. Just the JSON object.` 
                }] 
            }],
            generationConfig: {
                temperature: 0.9,
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
            console.error("Gemini Error Detail:", JSON.stringify(result));
            return {
                statusCode: response.status,
                headers,
                body: JSON.stringify({ 
                    error: "Upstream API Error", 
                    message: result.error?.message || "Model connection failed." 
                })
            };
        }

        let rawContent = result.candidates?.[0]?.content?.parts?.[0]?.text;

        // Ensure we handle cases where Gemini might return a string instead of pre-parsed JSON
        const parsedContent = typeof rawContent === 'string' ? JSON.parse(rawContent) : rawContent;

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(parsedContent)
        };

    } catch (error) {
        console.error("Internal Function Error:", error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "Processing Error", message: error.message })
        };
    }
};
