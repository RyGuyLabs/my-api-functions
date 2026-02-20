exports.handler = async (event) => {
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json"
    };

    if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "OK" };

    try {
        const body = JSON.parse(event.body);
        const apiKey = process.env.CAREER_BUILD_KEY;

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

        const response = await fetch(url, {
            method: 'POST',
            body: JSON.stringify({
                contents: [{ parts: [{ text: `Return JSON only: { "careerTitle": "AI Dev", "alignmentScore": 90, "earningPotential": "$150k", "attainmentPlan": ["Step1"], "reasoning": "Fit", "searchKeywords": ["AI"] }. Data: ${JSON.stringify(body)}` }] }]
            })
        });

        const result = await response.json();
        if (!response.ok) {
            console.error("Gemini Error:", result);
            return { statusCode: 500, headers, body: JSON.stringify(result) };
        }

        const text = result.candidates[0].content.parts[0].text;
        return { statusCode: 200, headers, body: JSON.stringify(JSON.parse(text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1))) };
    } catch (e) {
        console.error("Internal Crash:", e.message);
        return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
    }
};
