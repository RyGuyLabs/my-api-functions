exports.handler = async (event) => {
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json"
    };

    if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "OK" };

    try {
        const { hobbies, skills, talents, country } = JSON.parse(event.body);
        const apiKey = process.env.CAREER_BUILD_KEY;

        // Using the most universal, stable endpoint and model name
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;

        const response = await fetch(url, {
            method: 'POST',
            body: JSON.stringify({
                contents: [{ 
                    parts: [{ 
                        text: `SYSTEM: RyGuyLabs Career Engine. PRIME DIRECTIVE: Overcome fear/anxiety. Focus on task-execution and money. Return JSON ONLY: { "careerTitle": "string", "alignmentScore": 95, "earningPotential": "$100k+", "attainmentPlan": ["step1", "step2", "step3", "step4"], "reasoning": "string", "searchKeywords": ["k1"] }. DATA: ${hobbies}, ${skills}, ${talents}, ${country}` 
                    }] 
                }]
            })
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message || "API Error");

        const text = result.candidates[0].content.parts[0].text;
        const finalJson = JSON.parse(text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1));

        return { statusCode: 200, headers, body: JSON.stringify(finalJson) };
    } catch (e) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
    }
};
