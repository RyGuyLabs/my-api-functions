/**
 * RYGUY LABS - VELOCITY PROJECTOR BACKEND
 * Path: /netlify/functions/velocity-projector.js
 * Proprietary compounding algorithms for revenue projection.
 */

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers };

    try {
        const { velocity, dividend, factor } = JSON.parse(event.body);

        // Validation
        if (!velocity || !dividend) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: "MISSING_NUCLEUS_DATA" }) };
        }

        // --- RYGUY PROPRIETARY LOGIC ---
        const workingDays = 22;
        const dailyBase = velocity * dividend;
        const monthlyBase = dailyBase * workingDays;
        
        // Non-linear compounding logic (Simulation of skill acquisition)
        // We apply a "Mastery Curve" where growth starts slow and accelerates
        let trajectory = [];
        let currentMonthly = monthlyBase;
        const annualMultiplier = parseFloat(factor);

        for (let m = 1; m <= 12; m++) {
            trajectory.push({
                month: `M${m}`,
                revenue: Math.round(currentMonthly),
                cumulative: Math.round(currentMonthly * m) // Simplified for projection
            });
            
            // Compounding happens monthly based on the factor
            // Factor of 1.10 = 10% annual increase, split into monthly compounding steps
            const monthlyGrowth = 1 + ((annualMultiplier - 1) / 12);
            currentMonthly *= monthlyGrowth;
        }

        const projectedAnnual = trajectory.reduce((acc, curr) => acc + curr.revenue, 0);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                daily: dailyBase,
                monthly: monthlyBase,
                annual: projectedAnnual,
                trajectory: trajectory,
                protocol: "V4.0_STABLE",
                timestamp: new Date().toISOString()
            })
        };

    } catch (error) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "PROJECTION_ENGINE_FAILURE" })
        };
    }
};
