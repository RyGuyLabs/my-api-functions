const { GoogleGenerativeAI } = require("@google/generative-ai");

exports.handler = async (event) => {
    if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

    try {
        const { asset, data } = JSON.parse(event.body);
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-09-2025" });

        const systemPrompt = `
            You are the Aggressive Income Stream Validator.
            The user is looking for an arbitrage opportunity (buying low on one market, selling high on another).
           
            YOUR TASK:
            Analyze the raw market data provided for "${asset}".
            Be blunt, extremely analytical, and task-oriented.
           
            RETURN JSON ONLY:
            {
                "verdict": "STRONG BUY / WEAK / AVOID",
                "confidence": 0-100,
                "logistics": ["Point 1 about why it works", "Point 2 about margins"],
                "risks": ["Risk of slippage", "Risk of withdrawal delay"],
                "steps": ["Step 1: Execute Buy", "Step 2: Transfer", "Step 3: Sell"]
            }
        `;

        const result = await model.generateContent({
            contents: [{ parts: [{ text: `DATA: ${data}` }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
            generationConfig: { responseMimeType: "application/json" }
        });

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: result.response.text()
        };

    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Analysis Timeout" })
        };
    }
};
