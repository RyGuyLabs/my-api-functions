/**
 * RYGUY LABS | DAY ZERO PLAYBOOK BACKEND
 * PATH: /.netlify/functions/day-zero-playbook
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
        const data = JSON.parse(event.body);
        const { 
            decision, 
            moneySpent, 
            hoursPerWeek, 
            monthsWasted, 
            hourlyRate,
            projectName 
        } = data;

        // Logic for "NO" Decision (Sunk Cost Surgery)
        if (decision === 'NO') {
            const weeklyLoss = hoursPerWeek * hourlyRate;
            const sixMonthLoss = weeklyLoss * 4.3 * 6;
            const annualLoss = weeklyLoss * 52;

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    severity: "CRITICAL",
                    insight: `You have already spent $${moneySpent.toLocaleString()} buying a lesson. The money is gone. If you stay another 6 months, you will bleed an additional $${sixMonthLoss.toLocaleString()} in time-wealth. Quitting today is an immediate profit of $${annualLoss.toLocaleString()} in reclaimed annual capacity.`,
                    reframe: `Stop trying to "fix" a mistake. You are currently paying $${weeklyLoss.toLocaleString()} per week to avoid the discomfort of being wrong. Fire this project today.`,
                    ctaText: "Explore the RyGuyLabs Career Builder",
                    ctaLink: "#career-builder" 
                })
            };
        }

        // Logic for "YES" Decision (Growth Calibration)
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                severity: "OPTIMAL",
                insight: `Since you would start ${projectName} today with zero previous investment, your focus must shift from 'maintenance' to 'aggression'.`,
                reframe: `Every hour spent is now a fresh investment. You aren't "continuing" a struggle; you are funding a future win.`,
                ctaText: "Open the Dream Planner App",
                ctaLink: "#dream-planner"
            })
        };

    } catch (err) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "Strategic Engine Stall" })
        };
    }
};
