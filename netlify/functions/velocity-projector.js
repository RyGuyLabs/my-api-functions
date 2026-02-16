/**
 * RYGUY LABS - STRATEGIC VELOCITY ENGINE
 * Path: /netlify/functions/velocity-projector.js
 * Version: 5.1.0 - Custom Variable Support & Sync Logic
 */

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers };

    try {
        const body = JSON.parse(event.body);
        const { velocity, dividend, factor } = body;
        
        // Dynamic Variable Override
        const workingDays = parseInt(body.workingDays) || 22;

        if (!velocity || !dividend) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: "NUCLEUS_INCOMPLETE" }) };
        }

        const dailyBase = parseFloat(velocity) * parseFloat(dividend);
        const monthlyBase = dailyBase * workingDays;
        const annualFactor = parseFloat(factor);

        const scenariosConfig = [
            { id: 'cons', label: 'Linear Floor', growthScale: 1.0 },
            { id: 'std', label: 'RyGuy Standard', growthScale: annualFactor },
            { id: 'agg', label: 'Aggressive', growthScale: Math.max(annualFactor * 1.5, 1.25) }
        ];

        const scenarios = scenariosConfig.map(config => {
            let trajectory = [];
            let currentMonthly = monthlyBase;
            let totalAnnual = 0;

            for (let m = 1; m <= 12; m++) {
                trajectory.push({ month: `M${m}`, revenue: Math.round(currentMonthly) });
                totalAnnual += currentMonthly;
                
                // V5 Mastery Curve Logic
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

        // Synchronized Milestone Logic
        const milestones = [];
        if (annualTotal >= 100000) milestones.push({ icon: "◈", text: "Six-Figure Target Locked" });
        if (annualTotal >= 300000) milestones.push({ icon: "⚡", text: "RyGuy Standard Active" });
        if (annualTotal >= 500000) milestones.push({ icon: "👑", text: "Market Apex Verified" });
        if (dailyBase >= 2000) milestones.push({ icon: "⚛", text: "Daily Floor Protocol Cleared" });

        const stats = {
            avgMonthlyGrowth: ((annualFactor - 1) / 12).toFixed(4),
            peakMonth: standardPath.trajectory[11].revenue,
            cumulativeAnnual: annualTotal
        };

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
                scenarios,
                milestones,
                stats,
                tier,
                protocol: "V5.1_STABLE",
                timestamp: new Date().toISOString()
            })
        };

    } catch (error) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: "ENGINE_FAULT" }) };
    }
};
