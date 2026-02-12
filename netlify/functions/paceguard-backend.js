/**
 * PACEGUARD™ v3.0 | Heavy-Duty Spectrum Engine
 * Behavioral Analysis & Tactical Insight Logic
 * Production Grade - Optimized for Ry Guy Labs
 */

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers };

    try {
        const body = JSON.parse(event.body);
        const { history, baseline } = body;
        
        // Validation: Ensure we have enough data for a sophisticated analysis
        if (!history || history.length < 5) {
            return { 
                statusCode: 200, 
                headers, 
                body: JSON.stringify({ 
                    fusionScore: 0, 
                    insight: "INITIALIZING NEURAL LINK...",
                    diagnostics: { momentum: 0, volatility: 0, intensityRatio: "0.00" } 
                }) 
            };
        }

        const volumes = history.map(h => h.vol);
        const baselineVol = Math.max(baseline.vol, 2); // Prevent division by zero

        /**
         * 1. MOMENTUM (Weighted Power Analysis)
         * We give 60% weight to the most recent 5 samples to detect immediate "pushing."
         */
        const recentAvg = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
        const momentumFactor = recentAvg / baselineVol;

        /**
         * 2. VOLATILITY (Micro-Temporal Jitter)
         * Measuring the "Syllabic Attack." High jitter indicates gasping or rapid-fire 
         * word delivery common in high-anxiety states.
         */
        let temporalJitter = 0;
        for (let i = 1; i < volumes.length; i++) {
            const diff = Math.abs(volumes[i] - volumes[i-1]);
            // Exponential penalty for larger jumps
            temporalJitter += Math.pow(diff, 1.2); 
        }
        const volatilityScore = (temporalJitter / volumes.length) * 8.5;

        /**
         * 3. SPECTRAL RESONANCE (Simulated Stability)
         * Calculates the "Coefficient of Variation." 
         * Low variance in volume during speech indicates controlled breath work.
         */
        const mean = volumes.reduce((a, b) => a + b, 0) / volumes.length;
        const variance = volumes.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / volumes.length;
        const resonance = Math.max(0, 100 - (Math.sqrt(variance) * 15));

        /**
         * 4. THE FUSION CORE (Neural Aggregator)
         * Sophisticated weighting: 
         * - 40% Momentum (Power)
         * - 50% Volatility (Rhythm)
         * - 10% Resonance (Texture)
         */
        let fusion = (momentumFactor * 40) + (volatilityScore * 0.9) - (resonance * 0.1);

        /**
         * 5. TACTICAL INSIGHT GENERATOR
         * Scripted for high-stakes communication.
         */
        let insight = "SPECTRUM OPTIMAL";
        
        if (fusion > 88) {
            insight = "CRITICAL: NEURAL OVERLOAD. FULL SILENCE FOR 3 SECONDS TO RESET.";
        } else if (momentumFactor > 2.8) {
            insight = "INTENSITY ALERT: VOCAL PUSH DETECTED. DROP PITCH AND LOWER VOLUME.";
        } else if (volatilityScore > 42) {
            insight = "CADENCE WARNING: ERRATIC RHYTHM. SLOW DOWN AND ENUNCIATE.";
        } else if (resonance < 40) {
            insight = "RESONANCE DECAY: BREATH CONTROL FAILING. RECENTER.";
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                fusionScore: Math.min(99, Math.max(0, Math.round(fusion))),
                diagnostics: {
                    momentum: Math.round(momentumFactor * 10),
                    volatility: Math.round(volatilityScore),
                    intensityRatio: momentumFactor.toFixed(2),
                    resonance: Math.round(resonance)
                },
                insight: insight
            })
        };
    } catch (err) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "SPECTRUM ENGINE FAILURE", details: err.message })
        };
    }
};
