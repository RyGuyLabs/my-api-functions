/**
 * PACEGUARD™ v3.0 | Heavy-Duty Backend
 * RY GUY LABS - PRODUCTION GRADE
 */

exports.handler = async (event) => {
    // 1. Mandatory Headers for Production Netlify Environment
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    // 2. Handle Pre-flight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        if (!event.body) throw new Error("No data received");
        
        const payload = JSON.parse(event.body);
        const { history = [], baseline = { vol: 5 } } = payload;

        // 3. Prevent Zero-Division if no speech is detected
        if (history.length < 3) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    fusionScore: 0,
                    insight: "AWAITING VOCAL INPUT",
                    diagnostics: { momentum: 10, volatility: 0, resonance: 100 }
                })
            };
        }

        const volumes = history.map(h => h.vol);
        const baseVol = Math.max(baseline.vol, 1);

        // --- HEAVY DUTY ANALYTICS ---
        
        // MOMENTUM (Power vs Baseline)
        const recent = volumes.slice(-5);
        const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const momRaw = (avg / baseVol);

        // VOLATILITY (The delta between peaks)
        let delta = 0;
        for (let i = 1; i < volumes.length; i++) {
            delta += Math.abs(volumes[i] - volumes[i-1]);
        }
        const volRaw = (delta / volumes.length) * 12;

        // RESONANCE (Standard Deviation Stability)
        const mean = volumes.reduce((a, b) => a + b, 0) / volumes.length;
        const vari = volumes.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / volumes.length;
        const resRaw = Math.max(0, 100 - (Math.sqrt(vari) * 15));

        // FUSION CORE MATH
        const scoreCalc = (momRaw * 30) + (volRaw * 0.8) - (resRaw * 0.1);
        const fusionScore = Math.round(Math.min(99, Math.max(0, scoreCalc)));

        // TACTICAL INSIGHTS
        let insight = "SPECTRUM OPTIMAL";
        if (fusionScore > 80) insight = "CRITICAL: NEURAL OVERLOAD. RESET.";
        else if (volRaw > 35) insight = "CADENCE WARNING: ERRATIC RHYTHM.";
        else if (momRaw > 2.5) insight = "INTENSITY ALERT: VOCAL PUSHING.";

        // 4. Final Response - Perfectly Mapped to Frontend Keys
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                fusionScore,
                insight,
                diagnostics: {
                    momentum: Math.round(momRaw * 10),
                    volatility: Math.round(volRaw),
                    resonance: Math.round(resRaw)
                }
            })
        };

    } catch (err) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: err.message, fusionScore: 0 })
        };
    }
};
