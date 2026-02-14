const { GoogleGenerativeAI } = require("@google/generative-ai");

exports.handler = async (event, context) => {
    // MANDATORY CORS HANDSHAKE FOR SQUARESPACE
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json"
    };

    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 200, headers, body: "" };
    }

    if (event.httpMethod !== "POST") {
        return { statusCode: 405, headers, body: "Method Not Allowed" };
    }

    const apiKey = process.env.GEMINI_API_KEY || ""; 
    const genAI = new GoogleGenerativeAI(apiKey);
    
    const systemInstruction = `
        You are the RyGuyLabs Strategic Auditor.
        Philosophy: Money is Primary. Sleep is Secondary.
        Goal: Ruthless efficiency and overcoming the Prime Directive (Fear/Anxiety).
        Rules:
        1. Rate inputs: S-TIER (High Leverage), B-TIER (Average), GARBAGE (Busy work/Avoidance).
        2. Create a "Fear-Eraser": A 5-minute action that forces exposure to the user's reported fear.
        3. Calculate "Opportunity Cost": A monetary value lost if they don't act now.
    `;

    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash-preview-09-2025",
        systemInstruction: systemInstruction
    });

    try {
        const { area, today, impact, fear } = JSON.parse(event.body);

        const prompt = `
            AUDIT DATA: Area: ${area} | Task: ${today} | Leverage: ${impact} | Fear: ${fear}
            Return JSON only:
            {
                "auditRating": "S-TIER" | "B-TIER" | "GARBAGE",
                "feedback": "1-sentence critique.",
                "fearEraser": "5-minute task.",
                "opportunityCost": "$$$ loss.",
                "directive": "10-word command.",
                "revenueProjection": "Impact statement.",
                "path": "Steps."
            }
        `;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        const auditResult = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);

        return { statusCode: 200, headers, body: JSON.stringify(auditResult) };
    } catch (error) {
        return { 
            statusCode: 500, 
            headers, 
            body: JSON.stringify({ error: "Engine Failure", feedback: "Overload. Re-align." }) 
        };
    }
};
