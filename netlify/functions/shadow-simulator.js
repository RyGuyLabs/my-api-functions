exports.handler = async (event) => {
    const allowedOrigins = ["https://www.ryguylabs.com", "https://ryguylabs.com"];
    const origin = event.headers.origin || event.headers.Origin;
    const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

    const headers = {
        "Access-Control-Allow-Origin": corsOrigin,
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json"
    };

    if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers };

    try {
        const { message, history, targetRole, industry, interviewerType } = JSON.parse(event.body);
        const apiKey = process.env.SHADOW_SIM_KEY;

        const systemPrompt = `You are a ${interviewerType} conducting a high-stakes interview for a ${targetRole} in the ${industry} industry.
        Analyze the candidate's response for anxiety markers (hesitation, weak phrasing).
        You MUST return ONLY this JSON structure:
        {
          "interviewerReply": "Your next direct interview question",
          "tacticalResonance": {
            "strength": "Quote the user's best phrase and explain why it worked",
            "weakness": "Quote the user's weakest phrase/anxiety marker",
            "improvement": "The exact high-authority rephrasing they should use"
          },
          "stressLevel": 1-10
        }`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: `${systemPrompt}\n\nUser: ${message}\nHistory: ${JSON.stringify(history.slice(-6))}` }] }],
                generationConfig: { responseMimeType: "application/json" }
            })
        });

        const data = await response.json();
        return {
            statusCode: 200,
            headers,
            body: data.candidates[0].content.parts[0].text
        };
    } catch (e) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: "Neural Link Interrupted", details: e.message }) };
    }
};
