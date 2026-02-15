/**
 * RYGUY LABS | THE STOCKHOLM CLOSE BACKEND (V3 - HIGH DIMENSIONALITY)
 * PATH: /.netlify/functions/stockholm-close
 */

exports.handler = async (event) => {
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json"
    };

    if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers };

    try {
        const { 
            projectName, 
            dayZeroResponse, 
            investmentLevel, 
            hourlyValue, 
            emotionalDrain,
            marketSentiment,
            revenueTrajectory,
            teamFriction,
            lastMajorWin
        } = JSON.parse(event.body);

        // --- ENHANCED HEURISTIC ENGINE ---
        
        // 1. Opportunity Cost (Calculated on 30 hours/week for serious commitments)
        const weeklyHours = 30; 
        const yearlyHours = weeklyHours * 52;
        const potentialLoss = yearlyHours * (hourlyValue || 100);
        
        // 2. Multi-Layered Stockholm Index (Max 100)
        let score = 0;
        if (dayZeroResponse === "no") score += 40;
        if (investmentLevel === "high") score += 15;
        if (emotionalDrain === "high") score += 10;
        if (marketSentiment === "dying") score += 15;
        if (revenueTrajectory === "declining") score += 10;
        if (teamFriction === "toxic") score += 10;

        // 3. Dynamic Narrative Generation (The "AI" Feel)
        let status = "";
        let recommendation = "";
        let pivotPath = "";
        let diagnosis = "";

        if (score >= 75) {
            status = "TERMINAL SUNK-COST SYNDROME";
            diagnosis = `The combination of ${marketSentiment} market sentiment and ${teamFriction} team dynamics suggests this isn't just a project—it's a liability. Your "Day Zero" intuition is correct: you are guarding a graveyard.`;
            recommendation = `EJECT PROTOCOL: You are incinerating $${potentialLoss.toLocaleString()} of potential yearly wealth. Every hour spent here is a double loss (the time spent + the opportunity missed).`;
            pivotPath = "IMMEDIATE LIQUIDATION: Sell assets, fire clients, or archive code. Do not 'transition'—just stop.";
        } else if (score >= 45) {
            status = "STRATEGIC STAGNATION (ZOMBIE)";
            diagnosis = `With a ${revenueTrajectory} trajectory and ${emotionalDrain} emotional drain, this project is "walking dead." It's not failing enough to quit, but not winning enough to matter.`;
            recommendation = `The $${potentialLoss.toLocaleString()} burn rate is tolerable now, but it will become your ceiling. You are trading your greatness for "fine."`;
            pivotPath = "THE 80/20 PURGE: Identify the 20% of this project that actually works. Kill the other 80% within 7 days. If the needle doesn't move, Eject.";
        } else {
            status = "FOUNDATIONAL GROWTH";
            diagnosis = `Despite the ${investmentLevel} investment, your Day Zero alignment is strong. The ${marketSentiment} market outlook suggests you are in the right place at the right time.`;
            recommendation = "Maintain current velocity. Your opportunity cost is an investment, not a loss.";
            pivotPath = "INTENSIFY: Aggressively automate the mundane. You have Day Zero clarity—don't waste it on slow execution.";
        }

        // Add a specialized insight based on "Last Major Win"
        if (lastMajorWin === "ancient") {
            diagnosis += " Crucial Note: Your lack of recent wins indicates you are living on nostalgia, not momentum.";
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                status,
                index: Math.min(score, 100),
                opportunityCost: potentialLoss,
                diagnosis,
                recommendation,
                pivotPath,
                project: projectName
            })
        };

    } catch (err) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "Audit Engine Stall", message: err.message })
        };
    }
};
