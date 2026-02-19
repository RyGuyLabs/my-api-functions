/**
 * RyGuyLabs - Clean Exit Strategy Backend Logic
 * File: exit-strategy.js (Netlify Serverless Function)
 */

exports.handler = async (event, context) => {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    try {
        const data = JSON.parse(event.body);

        // LEVERAGE ALGORITHM
        // Calculate the total temporal sink
        const weeklyHours = parseInt(data.hours) || 0;
        const totalMonths = parseInt(data.duration) || 0;
        const totalHoursSunk = weeklyHours * 4 * totalMonths;

        // Calculate total financial sink
        const capitalInvested = parseFloat(data.capital) || 0;
        const moneyLost = parseFloat(data.moneyLost) || 0;
        const totalSunkFinancial = capitalInvested + moneyLost;

        // Determine Verdict Severity
        let verdict = "SOFT FADE";
        if (totalHoursSunk > 500 || totalSunkFinancial > 10000) {
            verdict = "CLEAN CUT";
        }
        if (totalHoursSunk > 2000 || totalSunkFinancial > 50000) {
            verdict = "IMMEDIATE EXIT";
        }

        // Return calculated diagnostics
        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                verdict: verdict,
                totalHours: totalHoursSunk.toLocaleString(),
                totalSunk: totalSunkFinancial.toLocaleString(),
                hours: weeklyHours,
                target: data.target,
                reclaimed: data.reclaimed,
                fear: data.fear
            })
        };

    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Failed to process diagnostic logic" })
        };
    }
};
