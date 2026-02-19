/**
 * RyGuyLabs - Career Alignment Engine
 * Version 2.2 - Upstream Fix & Response Cleaning
 */

exports.handler = async (event, context) => {
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json"
    };

    // Handle Preflight
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
                body: JSON.stringify({ error: "Config Error", message: "API Key missing in Netlify." })
            };
        }

        // Use the stable 1.5 Flash endpoint
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

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
                    Important: Do not include any text before or after the JSON.` 
                }] 
            }],
            generationConfig: {
                temperature: 1,
                topP: 0.95,
                topK: 40,
                maxOutputTokens: 1024,
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
            console.error("Gemini Error:", result);
            return {
                statusCode: response.status,
                headers,
                body: JSON.stringify({ 
                    error: "Upstream API Error", 
                    message: result.error?.message || "Google API rejected the request." 
                })
            };
        }

        // Extract the text content
        let rawContent = result.candidates?.[0]?.content?.parts?.[0]?.text;

        // Cleanup: Remove markdown backticks if Gemini accidentally included them
        if (rawContent.includes("```")) {
            rawContent = rawContent.replace(/```json/g, "").replace(/```/g, "").trim();
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(JSON.parse(rawContent))
        };

    } catch (error) {
        console.error("Internal Error:", error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "Logic Error", message: error.message })
        };
    }
};
