/**
 * RyGuyLabs - Clean Exit Strategy Evaluation Logic
 * File: exit-strategy.js (Netlify Serverless Function)
 */

exports.handler = async (event, context) => {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    try {
        const body = JSON.parse(event.body);
        
        // INPUT PARSING
        const target = body.target || "Current Venture";
        const weeklyHours = parseFloat(body.hours) || 0;
        const hourlyRate = parseFloat(body.rate) || 0;
        const directExpenses = parseFloat(body.expenses) || 0;
        const missedProfits = parseFloat(body.missedProfit) || 0;

        // ALGORITHMIC CALCULATIONS
        const annualTimeCost = weeklyHours * 52 * hourlyRate;
        const leakTotal = directExpenses + missedProfits;
        const totalExposure = annualTimeCost + leakTotal;

        // VERDICT LOGIC
        // If the total opportunity cost + leak is high relative to typical startup windows
        // we suggest a pivot. This is an evaluation tool, not a blind quiting tool.
        let shouldPivot = false;
        let message = "";

        if (totalExposure > 100000) {
            shouldPivot = true;
            message = `The combined value drain of ${target} is currently exceeding high-leverage benchmarks. Reclaiming this energy for your primary dream is statistically superior.`;
        } else if (leakTotal > annualTimeCost * 0.5) {
            shouldPivot = true;
            message = `Direct leakage and missed profits are disproportionately high compared to your time investment. This structure is inefficient.`;
        } else {
            shouldPivot = false;
            message = `Your current exposure in ${target} is within manageable growth limits. Optimization and expansion of this venture is recommended over abandonment.`;
        }

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                shouldPivot,
                message,
                annualTimeCost: annualTimeCost.toLocaleString(),
                leakTotal: leakTotal.toLocaleString(),
                target
            })
        };

    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Diagnostic calculation failed." })
        };
    }
};
