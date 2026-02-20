exports.handler = async (e) => {
    const h = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
    try {
        const { hobbies, skills, talents, country } = JSON.parse(e.body);
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.CAREER_BUILD_KEY}`;
        const res = await fetch(url, {
            method: 'POST',
            body: JSON.stringify({ contents: [{ parts: [{ text: `JSON ONLY. RyGuyLabs Prime Directive: Overcome fear. Data: ${hobbies}, ${skills}, ${talents}, ${country}. { "careerTitle": "...", "alignmentScore": 95, "earningPotential": "...", "attainmentPlan": ["..."], "reasoning": "...", "searchKeywords": ["..."] }` }] }] })
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error.message);
        const t = d.candidates[0].content.parts[0].text;
        return { statusCode: 200, headers: h, body: JSON.stringify(JSON.parse(t.substring(t.indexOf('{'), t.lastIndexOf('}') + 1))) };
    } catch (err) { return { statusCode: 500, headers: h, body: JSON.stringify({ error: err.message }) }; }
};
