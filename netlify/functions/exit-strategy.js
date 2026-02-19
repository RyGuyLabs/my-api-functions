/**
 * RyGuyLabs - Clean Exit Strategy Production Logic
 * Proprietary Valuation & Pivot Algorithm
 */

exports.handler = async (event, context) => {
    // SECURITY: Production-Grade CORS Headers
    const headers = {
        "Access-Control-Allow-Origin": "*", // Replace with your specific domain for tighter security
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json"
    };

    // Handle Browser Pre-flight Check
    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 200, headers, body: "OK" };
    }

    if (event.httpMethod !== "POST") {
        return { statusCode: 405, headers, body: JSON.stringify({ error: "Method Not Allowed" }) };
    }

    try {
        const body = JSON.parse(event.body);

        // DATA SANITIZATION & DEFAULTS
        const target = (body.target || "Current Venture").substring(0, 50);
        const weeklyHours = Math.abs(parseFloat(body.hours)) || 0;
        const hourlyRate = Math.abs(parseFloat(body.rate)) || 0;
        const directExpenses = Math.abs(parseFloat(body.expenses)) || 0;
        const missedProfits = Math.abs(parseFloat(body.missedProfit)) || 0;

        // PROPRIETARY AUDIT CALCULATIONS
        // 1. Annual Opportunity Cost (Temporal value)
        const annualTimeValue = weeklyHours * 52 * hourlyRate;
        
        // 2. Aggregate Leak (Capital + Opportunity Miss)
        const leakTotal = directExpenses + missedProfits;
        
        // 3. Total Strategic Exposure
        const totalExposure = annualTimeValue + leakTotal;

        // PIVOT DETERMINATION ALGORITHM
        let shouldPivot = false;
        let message = "";

        // Logic Gate: If total exposure exceeds high-leverage benchmarks 
        // OR if the financial leak is disproportionate to time investment.
        if (totalExposure > 120000) {
            shouldPivot = true;
            message = `Critical exposure detected. Your strategic energy in "${target}" is yielding a negative temporal ROI. Redirecting this resource to high-leverage activities is the primary move.`;
        } else if (leakTotal > (annualTimeValue * 0.4)) {
            shouldPivot = true;
            message = `Financial inefficiency identified. The direct capital drain of this project is outpacing its growth potential. A clean pivot is recommended.`;
        } else {
            shouldPivot = false;
            message = `Venture stability confirmed. Your current exposure in "${target}" is within healthy growth parameters. Focus on scaling and systematic expansion.`;
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                shouldPivot,
                message,
                annualTimeCost: annualTimeValue.toLocaleString('en-US', { minimumFractionDigits: 0 }),
                leakTotal: leakTotal.toLocaleString('en-US', { minimumFractionDigits: 0 }),
                target
            })
        };

    } catch (error) {
        console.error("Function Error:", error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "Diagnostic calculation failed internally." })
        };
    }
};
