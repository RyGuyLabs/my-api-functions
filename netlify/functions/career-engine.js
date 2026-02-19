/**
 * RyGuyLabs - Career Alignment Engine
 * Production Grade Serverless Function
 */

exports.handler = async (event, context) => {
    // MANDATORY: Universal Production Headers
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json"
    };

    // 1. Handle Preflight OPTIONS
    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 200, headers, body: "OK" };
    }

    // 2. Guard Method
    if (event.httpMethod !== "POST") {
        return { 
            statusCode: 405, 
            headers, 
            body: JSON.stringify({ error: "Method Not Allowed" }) 
        };
    }

    try {
        const { hobbies, skills, talents, country } = JSON.parse(event.body);
        const apiKey = process.env.FIRST_API_KEY;

        if (!apiKey) {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: "Configuration Error: API Key Missing" })
            };
        }

        const systemPrompt = `You are a Career Alignment Engine. Your objective is to extract characteristics (hobbies, interests, skills, talents) and align them with an ideal career path. You must provide clear steps for attainment and realistic earning for their region.`;

        const userPrompt = `
        User Profile:
        - Hobbies: ${hobbies}
        - Skills: ${skills}
        - Talents: ${talents}
        - Location: ${country}

        Generate a Career Alignment Blueprint. 
        IMPORTANT: Return ONLY a valid JSON object. No intro text.
        Structure:
        {
            "careerTitle": "string",
            "alignmentScore": number,
            "earningPotential": "string",
            "attainmentPlan": ["string", "string", "string"],
            "reasoning": "string",
            "searchKeywords": ["string", "string"]
        }`;

        // Using the stable flash-preview endpoint compatible with standard JSON configs
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`;

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: userPrompt }] }],
                systemInstruction: { parts: [{ text: systemPrompt }] },
                generationConfig: {
                    responseMimeType: "application/json",
                    temperature: 0.7
                }
            })
        });

        const result = await response.json();

        if (!response.ok) {
            console.error("Upstream Error:", result);
            return {
                statusCode: response.status,
                headers,
                body: JSON.stringify({ error: "AI Engine Sync Failed", details: result.error?.message || "Unknown error" })
            };
        }

        // Validate structure
        const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawText) {
            throw new Error("Empty response from AI engine");
        }

        // Parse and Return
        const careerData = JSON.parse(rawText);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(careerData)
        };

    } catch (error) {
        console.error("Internal Error:", error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                error: "Internal Processing Error", 
                message: error.message,
                tip: "Check if the API Key is set in Netlify Environment Variables."
            })
        };
    }
};
