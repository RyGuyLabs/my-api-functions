/**
 * RYGUY LABS - STRATEGIC VELOCITY ENGINE
 * Path: /netlify/functions/velocity-projector.js
 * Version: 5.4.0 - Market Dominance Edition
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
        
        // 1. Inputs & Sanitization
        const velocity = Math.abs(parseFloat(body.velocity)) || 0;
        const dividend = Math.abs(parseFloat(body.dividend)) || 0;
        const factor = Math.max(1.0, parseFloat(body.factor) || 1.1);
        const workingDays = Math.max(1, Math.min(parseInt(body.workingDays) || 22, 31));

        // Validation for reality check
        const isHyperGrowth = factor > 1.75;

        if (velocity === 0 || dividend === 0) {
            return { 
                statusCode: 200, 
                headers, 
                body: JSON.stringify({ 
                    daily: 0, monthly: 0, annual: 0, 
                    scenarios: [], milestones: [], 
                    stats: { avgMonthlyGrowth: 0, peakMonth: 0 },
                    tier: "Awaiting Input", protocol: "V5.4_IDLE" 
                }) 
            };
        }

        const dailyBase = velocity * dividend;
        const monthlyBase = dailyBase * workingDays;

        const scenariosConfig = [
            { id: 'cons', label: 'Linear Floor', growthScale: 1.0 },
            { id: 'std', label: 'RyGuy Standard', growthScale: factor },
            { id: 'agg', label: 'Aggressive', growthScale: Math.max(factor * 1.5, 1.25) }
        ];

        const scenarios = scenariosConfig.map(config => {
            let trajectory = [];
            let currentMonthly = monthlyBase;
            let totalAnnual = 0;

            for (let m = 1; m <= 12; m++) {
                trajectory.push({ month: `M${m}`, revenue: Math.round(currentMonthly) });
                totalAnnual += currentMonthly;
                
                // Skill-Modifier Mastery Curve
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

        // 2. Synchronized Milestones
        const milestones = [];
        if (annualTotal >= 100000) milestones.push({ icon: "◈", text: "Six-Figure Target Locked" });
        if (annualTotal >= 300000) milestones.push({ icon: "⚡", text: "RyGuy Standard Active" });
        if (annualTotal >= 500000) milestones.push({ icon: "👑", text: "Market Apex Verified" });
        if (dailyBase >= 2000) milestones.push({ icon: "⚛", text: "Daily Floor Protocol Cleared" });
        if (isHyperGrowth) milestones.push({ icon: "⚠️", text: "Hyper-Growth Warning: High Burn" });

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
                tier,
                stats: {
                    avgMonthlyGrowth: ((factor - 1) / 12),
                    peakMonth: standardPath.trajectory[11].revenue,
                    isHyperGrowth
                },
                protocol: "V5.4_STABLE"
            })
        };

    } catch (error) {
        return { 
            statusCode: 500, 
            headers, 
            body: JSON.stringify({ error: "INTERNAL_FAULT", message: error.message }) 
        };
    }
};
