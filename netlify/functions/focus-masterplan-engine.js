/**
 * RyGuyLabs Strategic Engine: Focus & Masterplan
 * Secure Backend logic for processing user focus areas and generating 
 * production-grade strategic blueprints.
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");

exports.handler = async (event, context) => {
    // Standard Production Guardrails
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    const apiKey = ""; // Environment handles this in production
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash-preview-09-2025",
        systemInstruction: "You are the RyGuyLabs Strategic Engine. Your goal is to transform user inputs into high-leverage, no-nonsense executive directives. You prioritize speed, momentum, and extreme focus. Use professional, analytical, and motivating language. Avoid fluff. Focus on ROI of time and energy."
    });

    try {
        const { area, today, impact } = JSON.parse(event.body);

        const prompt = `
            Analyze the following priority area and goals to create a high-visibility masterplan.
            
            PRIORITY AREA: ${area}
            MICRO-ACTION (TODAY): ${today}
            HIGH-IMPACT MOVE (LEVERAGE): ${impact}
            
            Return a structured JSON object with the following keys:
            - directive: A powerful 1-sentence focus directive for today.
            - permission: What specifically the user has permission to ignore/sacrifice to achieve this.
            - risk: The cognitive or strategic risk if they fail to focus on this.
            - path: A high-level optimization path (3 steps).
            - blueprint: An array of 4 objects, each with {icon, label, content}. 
                Labels should be: "Focus Directive", "Energy Alignment", "Boundary Enforcement", "90-Day Target".
        `;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        
        // Clean and parse the AI response
        const cleanedJson = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
        const masterplan = JSON.parse(cleanedJson);

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*" // Adjust for production CORS
            },
            body: JSON.stringify(masterplan)
        };

    } catch (error) {
        console.error("Strategic Engine Error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Failed to initialize strategic calculation." })
        };
    }
};
