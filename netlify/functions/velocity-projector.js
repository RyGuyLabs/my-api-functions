/**
 * RYGUY LABS - STRATEGIC VELOCITY ENGINE
 * Path: /netlify/functions/velocity-projector.js
 * Version: 5.0.0 - Multi-Scenario & Mastery Curve Logic
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

        if (!velocity || !dividend) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: "NUCLEUS_INCOMPLETE" }) };
        }

        const workingDays = 22;
        const dailyBase = velocity * dividend;
        const monthlyBase = dailyBase * workingDays;
        
        // Define Scenarios
        const scenarios = [
            { id: 'conservative', multiplier: 1.00, label: 'Linear Floor' },
            { id: 'standard', multiplier: parseFloat(factor), label: 'RyGuy Standard' },
            { id: 'aggressive', multiplier: Math.max(parseFloat(factor) * 1.5, 1.25), label: 'Dominant Producer' }
        ];

        const projection = scenarios.map(scenario => {
            let trajectory = [];
            let currentMonthly = monthlyBase;
            let totalAnnual = 0;

            for (let m = 1; m <= 12; m++) {
                trajectory.push({
                    month: `M${m}`,
                    revenue: Math.round(currentMonthly)
                });
                totalAnnual += currentMonthly;
                // Monthly compounding logic
                const monthlyGrowth = 1 + ((scenario.multiplier - 1) / 12);
                currentMonthly *= monthlyGrowth;
            }

            return {
                id: scenario.id,
                label: scenario.label,
                annual: Math.round(totalAnnual),
                trajectory: trajectory
            };
        });

        // Milestone Engine
        const standardAnnual = projection.find(p => p.id === 'standard').annual;
        const milestones = [];
        if (standardAnnual > 100000) milestones.push({ icon: "◈", text: "Six-Figure Velocity Verified" });
        if (standardAnnual > 300000) milestones.push({ icon: "⚡", text: "RyGuy Benchmark Exceeded" });
        if (standardAnnual > 500000) milestones.push({ icon: "👑", text: "Market Dominance Imminent" });

        // Tier Logic
        let tier = "Standard Producer";
        if (standardAnnual > 250000) tier = "Velocity Master";
        if (standardAnnual > 500000) tier = "Apex Producer";

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                daily: dailyBase,
                monthly: monthlyBase,
                scenarios: projection,
                milestones: milestones,
                tier: tier,
                protocol: "V5.0_STABLE",
                timestamp: new Date().toISOString()
            })
        };

    } catch (error) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: "ENGINE_FAULT" }) };
    }
};
