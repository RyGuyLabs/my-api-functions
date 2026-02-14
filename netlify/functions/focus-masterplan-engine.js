/**
 * RyGuyLabs Strategic Engine: High-Stakes Auditor
 * Aligned with Command Center UI v4.0
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");

exports.handler = async (event, context) => {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    const apiKey = ""; // Environment handles this
    const genAI = new GoogleGenerativeAI(apiKey);
    
    const systemInstruction = `
        You are the RyGuyLabs Strategic Auditor. 
        Philosophy: Money is Primary. Sleep is Secondary. 
        Goal: Ruthless efficiency and overcoming the Prime Directive (Fear/Anxiety).
        
        Rules:
        1. Rate inputs: S-TIER (High Leverage), B-TIER (Average), GARBAGE (Busy work/Avoidance).
        2. Create a "Fear-Eraser": A 5-minute action that forces exposure to the user's reported fear.
        3. Calculate "Opportunity Cost": A monetary or progress-based value lost if they don't act now.
        4. No fluff. No "self-care" language. Only directives.
    `;

    const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash-preview-09-2025",
        systemInstruction: systemInstruction
    });

    try {
        const { area, today, impact, fear } = JSON.parse(event.body);

        const prompt = `
            AUDIT DATA:
            Area: ${area}
            Immediate Task: ${today}
            Leverage Move: ${impact}
            Reported Anxiety/Fear: ${fear}
            
            Return JSON only:
            {
                "auditRating": "S-TIER" | "B-TIER" | "GARBAGE",
                "feedback": "A ruthless 1-sentence critique of their choices.",
                "fearEraser": "A specific 5-minute task to kill the fear reported.",
                "opportunityCost": "Estimated $$$ or progress loss per day of delay.",
                "directive": "A 10-word maximum command for the next 4 hours.",
                "revenueProjection": "High-level impact statement.",
                "path": "Step 1. Step 2. Step 3."
            }
        `;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        
        // Ensure clean JSON output
        const cleanedJson = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
        const auditResult = JSON.parse(cleanedJson);

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*" 
            },
            body: JSON.stringify(auditResult)
        };

    } catch (error) {
        console.error("Audit Engine Failure:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ 
                error: "Strategic Engine Failure",
                feedback: "The system crashed under the weight of low-leverage inputs. Re-align and try again."
            })
        };
    }
};
