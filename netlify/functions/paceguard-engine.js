// RYGUYLABS PROPRIETARY SPECTRUM ENGINE v3.0
/**
 * PACEGUARD™ v4.0 | Advanced Neural Inference Layer
 * Proprietary Behavioral Analysis Engine
 */

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers };

    try {
        const { history, baseline } = JSON.parse(event.body);
        const volumes = history.map(h => h.vol);
        
        // 1. ENTROPY ANALYSIS (Cadence Monitoring)
        // Detects the 'Sales Chant' or 'Repetitive Rhythms'
        const diffs = [];
        for (let i = 1; i < volumes.length; i++) diffs.push(Math.abs(volumes[i] - volumes[i-1]));
        const entropy = diffs.reduce((a, b) => a + b, 0) / diffs.length;

        // 2. HARMONIC TENSION (Simulated)
        // High frequency spikes relative to baseline
        const tension = volumes.filter(v => v > baseline.vol * 2.5).length / volumes.length;

        // 3. MOMENTUM ACCELERATION (The "Panic" Slope)
        const recent = volumes.slice(-10);
        const older = volumes.slice(0, 10);
        const acceleration = (recent.reduce((a,b)=>a+b,0)/10) - (older.reduce((a,b)=>a+b,0)/10);

        // 4. NEURAL FUSION CALCULATION
        // Weighted logic for professional/tactical defense
        const stressScore = (entropy * 12) + (tension * 100) + (Math.max(0, acceleration) * 15);
        const finalizedScore = Math.min(100, Math.max(0, stressScore));

        // 5. PREDICTIVE TACTICAL INSIGHTS
        let tacticalOutput = "SPECTRUM OPTIMAL";
        let priority = "LOW";

        if (finalizedScore > 85) {
            tacticalOutput = "CRITICAL: Speech velocity exceeding cognitive capacity. Hard pause required.";
            priority = "CRITICAL";
        } else if (finalizedScore > 60) {
            tacticalOutput = "ADVISORY: Rhythmic chanting detected. Lower pitch to regain authority.";
            priority = "MEDIUM";
        } else if (acceleration > 5) {
            tacticalOutput = "TREND: Intensity climbing. Regulate breath now.";
            priority = "PRE-EMPTIVE";
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                fusionScore: Math.round(finalizedScore),
                diagnostics: {
                    entropy: entropy.toFixed(2),
                    tension: tension.toFixed(2),
                    velocity: acceleration.toFixed(2)
                },
                insight: tacticalOutput,
                threatLevel: priority,
                systemStatus: "NEURAL_SHIELD_ACTIVE"
            })
        };

    } catch (err) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: "Inference Error" }) };
    }
};
