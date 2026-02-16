/**
 * RYGUY LABS - STRATEGIC VELOCITY ENGINE
 * Path: /netlify/functions/velocity-projector.js
 * Version: 5.0.0 - Non-linear Mastery Curve & Multi-Scenario Logic
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

        // Nucleus Guard
        if (!velocity || !dividend) {
            return { 
                statusCode: 400, 
                headers, 
                body: JSON.stringify({ error: "NUCLEUS_INCOMPLETE", message: "Velocity and Dividend required." }) 
            };
        }

        const workingDays = 22;
        const dailyBase = velocity * dividend;
        const monthlyBase = dailyBase * workingDays;
        const annualFactor = parseFloat(factor);

        // 1. Scenario Definitions
        const scenariosConfig = [
            { id: 'cons', label: 'Conservative (Linear)', growthScale: 1.0 },
            { id: 'std', label: 'RyGuy Standard', growthScale: annualFactor },
            { id: 'agg', label: 'Aggressive (Dominant)', growthScale: Math.max(annualFactor * 1.5, 1.25) }
        ];

        // 2. Trajectory Generation with Non-linear Skill Curve
        const scenarios = scenariosConfig.map(config => {
            let trajectory = [];
            let currentMonthly = monthlyBase;
            let totalAnnual = 0;

            for (let m = 1; m <= 12; m++) {
                trajectory.push({
                    month: `M${m}`,
                    revenue: Math.round(currentMonthly)
                });
                totalAnnual += currentMonthly;

                // Non-linear Skill Curve Modifier: 
                // Growth accelerates as "M" increases (m/12)^1.5 to simulate compounding skill acquisition.
                const skillModifier = Math.pow(m / 12, 1.5);
                const monthlyGrowth = 1 + (((config.growthScale - 1) / 12) * skillModifier);
                
                currentMonthly *= monthlyGrowth;
            }

            return {
                id: config.id,
                label: config.label,
                annual: Math.round(totalAnnual),
                trajectory: trajectory
            };
        });

        const standardPath = scenarios.find(s => s.id === 'std');
        const annualTotal = standardPath.annual;

        // 3. Dynamic Milestone Engine
        const milestones = [];
        if (annualTotal >= 100000) milestones.push({ icon: "◈", text: "Six-Figure Target Locked" });
        if (annualTotal >= 300000) milestones.push({ icon: "⚡", text: "RyGuy Standard Active" });
        if (annualTotal >= 500000) milestones.push({ icon: "👑", text: "Market Apex Verified" });
        if (dailyBase >= 2000) milestones.push({ icon: "⚛", text: "Daily Floor Protocol Cleared" });

        // 4. Statistics Cards Logic
        const stats = {
            avgMonthlyGrowth: ((annualFactor - 1) / 12).toFixed(4),
            peakMonth: standardPath.trajectory[11].revenue,
            cumulativeAnnual: annualTotal
        };

        // 5. Tier Assessment
        let tier = "Standard Producer";
        if (annualTotal > 250000) tier = "Velocity Master";
        if (annualTotal > 500000) tier = "Apex Producer";

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                daily: dailyBase,
                monthly: monthlyBase,
                annual: annualTotal,
                scenarios: scenarios,
                milestones: milestones,
                stats: stats,
                tier: tier,
                protocol: "V5.0_STABLE",
                timestamp: new Date().toISOString()
            })
        };

    } catch (error) {
        return { 
            statusCode: 500, 
            headers, 
            body: JSON.stringify({ error: "ENGINE_FAULT", message: error.message }) 
        };
    }
};
