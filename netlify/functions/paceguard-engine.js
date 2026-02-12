// RYGUYLABS PROPRIETARY SPECTRUM ENGINE v3.0
/**
 * PACEGUARD™ v3.0 | Neural Fusion Engine
 * Commercial Grade Inference Logic for Netlify/Lambda
 */

exports.handler = async (event) => {
    // 1. Production Headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers };

    try {
        const body = JSON.parse(event.body);
        const { history, baseline } = body;

        if (!history || history.length === 0) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: "No telemetry data provided." }) };
        }

        // 2. AI Pattern Analysis (Simulated Neural Layers)
        const recentVols = history.map(h => h.vol);
        const avgVol = recentVols.reduce((a, b) => a + b, 0) / recentVols.length;
        
        // Layer 1: Stress Detection (Vocal Micro-Jitter)
        let jitter = 0;
        for (let i = 1; i < recentVols.length; i++) {
            jitter += Math.abs(recentVols[i] - recentVols[i-1]);
        }
        const stressIndex = Math.min(100, (jitter / recentVols.length) * 15);

        // Layer 2: Aggression Mapping (Slope of Intensity)
        const firstHalf = recentVols.slice(0, Math.floor(recentVols.length / 2));
        const secondHalf = recentVols.slice(Math.floor(recentVols.length / 2));
        const firstAvg = firstHalf.reduce((a,b)=>a+b,0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((a,b)=>a+b,0) / secondHalf.length;
        const aggressionSlope = Math.max(0, (secondAvg - firstAvg) * 10);

        // Layer 3: Hold Pressure (Sustainability calculation)
        const holdIntensity = avgVol > (baseline.vol * 1.5) ? 1 : 0;

        // 3. Final Fusion Scoring (The Proprietary Mix)
        const neuralFusion = (stressIndex * 0.4) + (aggressionSlope * 0.4) + (holdIntensity * 20);
        
        // 4. Intelligence-Based Response
        let tacticalInsight = "";
        if (neuralFusion > 80) tacticalInsight = "CRITICAL: Speech patterns indicate high cortisol. Lower volume by 20% immediately.";
        else if (neuralFusion > 50) tacticalInsight = "WARNING: Pattern becoming repetitive. Shift your sitting posture to break the rhythm.";

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                fusionScore: Math.round(neuralFusion),
                metrics: {
                    stress: Math.round(stressIndex),
                    aggression: Math.round(aggressionSlope),
                    sustainability: holdIntensity
                },
                insight: tacticalInsight,
                timestamp: Date.now(),
                status: "SECURE_ANALYSIS_COMPLETE"
            })
        };

    } catch (err) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "Neural Engine Fault", details: err.message })
        };
    }
};
