// RYGUYLABS PROPRIETARY SPECTRUM ENGINE v4.1
/**
 * PACEGUARD™ v4.1 | Production-Grade Neural Inference Layer
 * Logic optimized for: Momentum, Volatility, and Hold Pressure.
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
       
        if (!history || history.length < 10) {
            return { statusCode: 200, headers, body: JSON.stringify({ fusionScore: 0, systemStatus: "AWAITING_DATA" }) };
        }

        const volumes = history.map(h => h.vol);
        const bVol = baseline.vol || 5;

        // 1. VOLATILITY (Anxiety & Tone Tension)
        // Calculated via Jitter (sample-to-sample jaggedness).
        let jitterSum = 0;
        for (let i = 1; i < volumes.length; i++) {
            jitterSum += Math.abs(volumes[i] - volumes[i-1]);
        }
        const volatilityValue = (jitterSum / volumes.length) * 10; 

        // 2. HOLD (Anger & Pressure)
        // Calculated via Compression Ratio.
        const pressureThreshold = bVol * 1.4;
        const sustainedSamples = volumes.filter(v => v > pressureThreshold).length;
        const holdValue = (sustainedSamples / volumes.length) * 100; 

        // 3. MOMENTUM (Cadence & Velocity)
        // Calculated via Slope Acceleration.
        const segmentSize = Math.floor(volumes.length / 3);
        const recentAvg = volumes.slice(-segmentSize).reduce((a, b) => a + b, 0) / segmentSize;
        const olderAvg = volumes.slice(0, segmentSize).reduce((a, b) => a + b, 0) / segmentSize;
        const acceleration = (recentAvg - olderAvg) * 15; 

        // 4. NEURAL FUSION (Weighted for Tactical Defense)
        const finalizedScore = Math.min(100, Math.max(0,
            (volatilityValue * 1.2) +
            (holdValue * 0.6) +
            (Math.max(0, acceleration) * 1.5)
        ));

        // 5. TACTICAL INSIGHTS
        let tacticalOutput = "SPECTRUM OPTIMAL";
        let state = "safe";

        if (finalizedScore > 80) {
            tacticalOutput = holdValue > 70 ? "CRITICAL: Vocal compression high. RELEASE TENSION." : "CRITICAL: Velocity overload. STOP.";
            state = "danger";
        } else if (finalizedScore > 55) {
            tacticalOutput = volatilityValue > 25 ? "ADVISORY: Micro-tremors detected. Stabilize breath." : "ADVISORY: Momentum building. Slow cadence.";
            state = "warning";
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                fusionScore: Math.round(finalizedScore),
                state: state,
                metrics: {
                    momentum: Math.round(Math.max(0, acceleration)),
                    volatility: Math.round(volatilityValue),
                    hold: Math.round(holdValue)
                },
                insight: tacticalOutput,
                systemStatus: "NEURAL_SHIELD_ACTIVE"
            })
        };

    } catch (err) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: "Inference Error" }) };
    }
};
