exports.handler = async (e) => {
    const h = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json"
    };
    
    if (e.httpMethod === "OPTIONS") return { statusCode: 200, headers: h, body: "" };

    try {
        const { hobbies, skills, talents, country } = JSON.parse(e.body);
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${process.env.CAREER_BUILD_KEY}`;
        
        const res = await fetch(url, {
            method: 'POST',
            body: JSON.stringify({
                contents: [{ 
                    parts: [{ 
                        text: `Return JSON ONLY. PRIME DIRECTIVE: Overcome social anxiety/fear to achieve high-performance dreams. 
                        Data: Hobbies: ${hobbies}, Skills: ${skills}, Talents: ${talents}, Location: ${country}.
                        Required Fields: careerTitle, alignmentScore (number), earningPotential, attainmentPlan (array), reasoning, searchKeywords (array).` 
                    }] 
                }],
                generationConfig: { responseMimeType: "application/json" }
            })
        });

        const d = await res.json();
        if (!res.ok) throw new Error(d.error?.message || "Gemini API Error");

        let t = d.candidates[0].content.parts[0].text;
        return { statusCode: 200, headers: h, body: t };
    } catch (err) {
        return { statusCode: 500, headers: h, body: JSON.stringify({ error: err.message }) };
    }
};
