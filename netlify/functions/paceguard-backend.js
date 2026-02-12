/**
 * PACEGUARD™ v3.0 | Heavy-Duty Backend
 * PRODUCTION VERSION - Hardened for Netlify Environment
 */

exports.handler = async (event) => {
    // REQUIRED: Production CORS and Response Headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    // Handle OPTIONS pre-flight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        if (!event.body) throw new Error("No payload detected");
        
        const data = JSON.parse(event.body);
        const { history = [], baseline = { vol: 5 } } = data;
        
        // Sophisticated fallback: If history is empty, return idle state instead of error
        if (history.length === 0) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    fusionScore: 0,
                    insight: "AWAITING AUDIO INPUT...",
                    diagnostics: { momentum: 10, volatility: 0, resonance: 100 }
                })
            };
        }

        const volumes = history.map(h => h.vol);
        const baselineVol = Math.max(baseline.vol, 1);

        // 1. MOMENTUM (Weighted Moving Average)
        const recent = volumes.slice(-5);
        const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const momentum = (avg / baselineVol);

        // 2. VOLATILITY (Standard Deviation of Delta)
        let deltaSum = 0;
        for (let i = 1; i < volumes.length; i++) {
            deltaSum += Math.abs(volumes[i] - volumes[i-1]);
        }
        const volatility = (deltaSum / volumes.length) * 10;

        // 3. RESONANCE (Vocal Stability)
        const mean = volumes.reduce((a, b) => a + b, 0) / volumes.length;
        const variance = volumes.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / volumes.length;
        const resonance = Math.max(0, 100 - (Math.sqrt(variance) * 12));

        // 4. FUSION CALCULATION (Weighted Formula)
        const fusion = (momentum * 35) + (volatility * 0.8) - (resonance * 0.05);

        // TACTICAL INSIGHTS
        let insight = "SPECTRUM OPTIMAL";
        if (fusion > 80) insight = "CRITICAL: NEURAL OVERLOAD. RESET NOW.";
        else if (volatility > 40) insight = "CADENCE WARNING: ERRATIC RHYTHM DETECTED.";
        else if (momentum > 2.5) insight = "INTENSITY ALERT: LOWER VOCAL POWER.";

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                fusionScore: Math.round(Math.min(99, Math.max(0, fusion))),
                insight: insight,
                diagnostics: {
                    momentum: Math.round(momentum * 10),
                    volatility: Math.round(volatility),
                    resonance: Math.round(resonance)
                }
            })
        };
    } catch (err) {
        console.error("Backend Error:", err);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "INTERNAL ENGINE ERROR", msg: err.message })
        };
    }
};
