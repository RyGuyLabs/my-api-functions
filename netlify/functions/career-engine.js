const https = require('https');

exports.handler = async (e) => {
    const h = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json"
    };
    
    if (e.httpMethod === "OPTIONS") return { statusCode: 200, headers: h, body: "" };

    try {
        if (!e.body) throw new Error("Missing request body");
        const { hobbies, skills, talents, country } = JSON.parse(e.body);
        const key = process.env.CAREER_BUILD_KEY;
        if (!key) throw new Error("Server configuration error: Key missing");

        const apiPayload = JSON.stringify({
            contents: [{ 
                parts: [{ 
                    text: `Return JSON ONLY. PRIME DIRECTIVE: Overcome social anxiety/fear to achieve high-performance dreams. 
                    Data: Hobbies: ${hobbies}, Skills: ${skills}, Talents: ${talents}, Location: ${country}.
                    Required Fields: careerTitle, alignmentScore (number), earningPotential, attainmentPlan (array), reasoning, searchKeywords (array).` 
                }] 
            }],
            generationConfig: { responseMimeType: "application/json", temperature: 0.7 }
        });

        const result = await new Promise((resolve, reject) => {
            const req = https.request(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${key}`,
                { method: 'POST', headers: { 'Content-Type': 'application/json' } },
                (res) => {
                    let data = '';
                    res.on('data', (chunk) => data += chunk);
                    res.on('end', () => resolve({ ok: res.statusCode === 200, status: res.statusCode, body: JSON.parse(data) }));
                }
            );
            req.on('error', reject);
            req.write(apiPayload);
            req.end();
        });

        if (!result.ok) throw new Error(result.body.error?.message || "Gemini API Error");

        const content = result.body.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!content) throw new Error("AI failed to generate a response");

        return { statusCode: 200, headers: h, body: content };
    } catch (err) {
        return { statusCode: 500, headers: h, body: JSON.stringify({ error: "Internal Error", message: err.message }) };
    }
};
