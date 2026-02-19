/**
 * RyGuyLabs - Career Alignment Engine
 * Version 2.1 - URL Parse Fix
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
                body: JSON.stringify({ error: "API Key is missing in Netlify environment variables." })
            };
        }

        // Ensure URL is a clean string with no line breaks
        const baseUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";
        const finalUrl = `${baseUrl}?key=${apiKey}`;

        const apiPayload = {
            contents: [{ 
                parts: [{ 
                    text: `Align these: Hobbies: ${hobbies}, Skills: ${skills}, Talents: ${talents}, Location: ${country}. 
                    Return ONLY JSON: {"careerTitle":"","alignmentScore":0,"earningPotential":"","attainmentPlan":[],"reasoning":"","searchKeywords":[]}` 
                }] 
            }],
            generationConfig: {
                responseMimeType: "application/json",
                temperature: 0.7
            }
        };

        const response = await fetch(finalUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(apiPayload)
        });

        const result = await response.json();

        if (!response.ok) {
            return {
                statusCode: response.status,
                headers,
                body: JSON.stringify({ error: "Upstream API Error", details: result })
            };
        }

        const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(JSON.parse(rawText))
        };

    } catch (error) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "URL or Parsing Error", message: error.message })
        };
    }
};
