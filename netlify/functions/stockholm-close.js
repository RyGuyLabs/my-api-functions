/**
 * RYGUY LABS | THE STOCKHOLM CLOSE BACKEND (V2 - ENHANCED)
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
            investmentLevel, 
            dayZeroResponse, 
            hourlyValue, 
            yearsLeft,
            emotionalDrain 
        } = JSON.parse(event.body);

        // --- THE HEURISTIC ENGINE (Proprietary Logic) ---
        
        // 1. Opportunity Cost Calculation
        // If they spend 20 hours a week on a dead project for 1 more year...
        const weeklyHours = 20; 
        const yearlyHours = weeklyHours * 52;
        const potentialLoss = yearlyHours * (hourlyValue || 50);
        
        // 2. The Stockholm Index (0-100)
        let stockholmIndex = 0;
        if (dayZeroResponse === "no") stockholmIndex += 60;
        if (investmentLevel === "high") stockholmIndex += 25;
        if (emotionalDrain === "high") stockholmIndex += 15;

        // 3. Status Determination
        let status = "";
        let recommendation = "";
        let pivotPath = "";

        if (stockholmIndex >= 80) {
            status = "SUNK COST TRAP (CRITICAL)";
            recommendation = `You are currently burning approximately $${potentialLoss.toLocaleString()} per year in opportunity cost.`;
            pivotPath = "TOTAL EJECT: Stop all operations within 48 hours. Redirect this energy into a 'Day Zero' project immediately.";
        } else if (stockholmIndex >= 50) {
            status = "ZOMBIE PROJECT";
            recommendation = "This project is neither dead nor alive. It consumes just enough resources to keep you from starting something great.";
            pivotPath = "AGGRESSIVE PIVOT: Strip the project down to its 1 most valuable feature. Kill the rest. Re-evaluate in 14 days.";
        } else {
            status = "STRATEGIC ASSET";
            recommendation = "You are in the clear, but stay vigilant. Sunk cost bias can creep in as investment grows.";
            pivotPath = "DOUBLE DOWN: Since you would choose this today, increase your intensity. Speed is your only protection.";
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                status,
                index: stockholmIndex,
                opportunityCost: potentialLoss,
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
