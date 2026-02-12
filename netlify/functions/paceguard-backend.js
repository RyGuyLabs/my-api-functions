/**
* PACEGUARD™ v3.0 | Proprietary Spectrum Engine
* Behavioral Analysis & Tactical Insight Logic
*/

exports.handler = async (event) => {
    // Standard headers for cross-origin Squarespace integration
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
            return { statusCode: 200, headers, body: JSON.stringify({ fusionScore: 0 }) };
        }

        // 1. EXTRACT DATA
        const volumes = history.map(h => h.vol);
        const currentAvg = volumes.reduce((a, b) => a + b, 0) / volumes.length;
        const baselineVol = baseline.vol || 5;

        // 2. MOMENTUM CALCULATION (Energy Output)
        // High momentum indicates "pushing" the voice.
        const momentumFactor = currentAvg / baselineVol;

        // 3. VOLATILITY CALCULATION (Erraticism)
        // Measures the "jumpiness" of the speech. High volatility = Anxiety/Rushing.
        let jitter = 0;
        for (let i = 1; i < volumes.length; i++) {
            jitter += Math.abs(volumes[i] - volumes[i-1]);
        }
        const volatilityScore = (jitter / volumes.length) * 10;

        // 4. THE FUSION CORE (Neural Logic)
        // We combine the raw intensity with the "erraticism" of the pace.
        let fusion = (momentumFactor * 35) + (volatilityScore * 0.8);

        // 5. TACTICAL INSIGHT GENERATOR
        // Logic for the "Scripts Drawer" alerts.
        let insight = null;
       
        if (fusion > 85) {
            insight = "CRITICAL: Syllabic velocity peak. Full silence for 3 seconds to reset.";
        } else if (momentumFactor > 2.2) {
            insight = "INTENSITY ALERT: Volume exceeds baseline. Drop pitch and lower volume.";
        } else if (volatilityScore > 40) {
            insight = "CADENCE WARNING: Rhythm is erratic. Slow down and emphasize consonants.";
        } else {
            insight = "SPECTRUM OPTIMAL";
        }

        // Clamp fusion score between 0-99 for the UI
        const finalScore = Math.min(99, Math.max(0, Math.round(fusion)));

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                fusionScore: finalScore,
                diagnostics: {
                    momentum: Math.round(momentumFactor * 10),
                    volatility: Math.round(volatilityScore),
                    intensityRatio: momentumFactor.toFixed(2)
                },
                insight: insight
            })
        };
    } catch (err) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "Neural Sync Failure", details: err.message })
        };
    }
}; 
