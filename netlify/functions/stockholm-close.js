/**
 * RYGUY LABS | THE STOCKHOLM CLOSE BACKEND (PRODUCTION GRADE)
 * PATH: /.netlify/functions/stockholm-close
 */

exports.handler = async (event) => {
    const headers = {
        "Access-Control-Allow-Origin": "*", // Change to your specific domain in final production
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json"
    };

    if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers };

    try {
        if (!event.body) throw new Error("No payload provided");
        
        const data = JSON.parse(event.body);
        
        // --- SANITIZATION & DEFAULTS ---
        const projectName = (data.projectName || "Undisclosed Venture").substring(0, 50);
        const hourly = Math.max(0, Math.min(10000, parseFloat(data.hourlyValue) || 100));
        
        // --- STRATEGIC WEIGHTS ---
        let score = 0;
        if (data.dayZeroResponse === "no") score += 45;
        if (data.investmentLevel === "high") score += 15;
        if (data.revenueTrajectory === "declining") score += 10;
        if (data.marketSentiment === "dying") score += 15;
        if (data.teamFriction === "toxic") score += 10;
        if (data.emotionalDrain === "high") score += 5;

        // --- CALCULATION ---
        // We assume 30 hrs/week of 'occupied' mental bandwidth for a hostage project
        const annualBurn = 30 * 52 * hourly;

        let status, diagnosis, pivotPath, severity;

        if (score >= 70) {
            severity = "CRITICAL";
            status = "TERMINAL SUNK-COST TRAP";
            diagnosis = `The data confirms a high-level cognitive entrapment. Your Day Zero intuition rejects ${projectName}, yet your history compels you to stay. This isn't loyalty; it's a financial and emotional parasite.`;
            pivotPath = "TOTAL LIQUIDATION: Execute an 'Immediate Stop' order. Do not attempt a graceful exit. Every 24 hours of delay costs you approximately $" + Math.round(annualBurn/365).toLocaleString() + ".";
        } else if (score >= 40) {
            severity = "WARNING";
            status = "STRATEGIC ZOMBIE STATE";
            diagnosis = `This project is in a 'Dead Zone'. It's yielding just enough to prevent you from quitting, but not enough to justify your ${hourly}/hr target. You are trading your high-value years for low-value stability.`;
            pivotPath = "THE 14-DAY GAUNTLET: Cut all non-essential features. Set one aggressive KPI. If it is not met in 14 days, Eject without further review.";
        } else {
            severity = "SAFE";
            status = "HIGH-VELOCITY ASSET";
            diagnosis = `Your Day Zero alignment is intact. Current friction is likely temporary execution hurdles rather than structural failure. ${projectName} remains a valid vehicle for your wealth targets.`;
            pivotPath = "INTENSIFY: Aggressively remove bottlenecks. Since you would choose this today, treat every delay as an insult to your intelligence. Speed is your only risk.";
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                status,
                diagnosis,
                index: Math.min(score, 100),
                annualBurn,
                pivotPath,
                severity,
                project: projectName,
                timestamp: new Date().toISOString()
            })
        };

    } catch (err) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "Strategic Engine Stall", details: "Check payload integrity." })
        };
    }
};
