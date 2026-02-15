exports.handler = async (event) => {
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json"
    };

    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 204, headers };
    }

    try {
        const body = JSON.parse(event.body);
        const { dayData } = body; 

        // Calculation Logic: Audit the planning depth across the week
        let totalSurges = 0;
        let totalTargets = 0;
        let weeklyReadiness = 0;

        const dayMetrics = Object.keys(dayData).map(day => {
            const data = dayData[day];
            const filledCount = data.targets.filter(t => t.trim() !== "").length;
            const isSurge = data.isSurge;
            
            if (isSurge) totalSurges++;
            totalTargets += filledCount;

            // Strategic weighting: Surge days with full targets provide 2x readiness
            const baseReadiness = Math.min(filledCount / 5, 1);
            const readinessScore = isSurge ? baseReadiness * 1.2 : baseReadiness;

            return {
                day,
                readiness: Math.min(readinessScore, 1),
                filledCount
            };
        });

        // The Nucleus Protocol: Final assessment
        weeklyReadiness = (dayMetrics.reduce((acc, d) => acc + d.readiness, 0) / 7) * 100;

        let protocolStatus = "RECONNAISSANCE";
        if (weeklyReadiness > 80) protocolStatus = "MAXIMUM VELOCITY";
        else if (weeklyReadiness > 50) protocolStatus = "MARKET PENETRATION";

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                totalSurges,
                totalTargets,
                weeklyReadiness: Math.round(weeklyReadiness),
                protocolStatus,
                dayMetrics
            })
        };

    } catch (err) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "Velocity Engine Stall", message: err.message })
        };
    }
};
