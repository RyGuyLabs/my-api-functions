// RYGUYLABS PROPRIETARY SPECTRUM ENGINE v3.0
// Logic: Jitter, Entropy, Compression, and Non-Linear Fusion

exports.handler = async (event, context) => {
    if (event.httpMethod !== "POST") return { statusCode: 405, body: "Denied" };

    const { history, baseline, rawData } = JSON.parse(event.body);
    const bVol = Math.max(baseline.vol, 0.01);
    
    // 1. FUNDAMENTAL FREQUENCY JITTER (Micro-Stress)
    // We analyze the Zero Crossing Rate (ZCR) of the current buffer
    let zcr = 0;
    if (rawData && rawData.length > 0) {
        for (let i = 1; i < rawData.length; i++) {
            if ((rawData[i] - 128) * (rawData[i-1] - 128) < 0) zcr++;
        }
    }
    // High ZCR variance = vocal tension
    const jitterFactor = Math.min(100, (zcr / 50) * 10); 

    // 2. CADENCE ENTROPY (The "Salesman Chant")
    // Measures the predictability of speech bursts
    const getEntropy = () => {
        if (history.length < 20) return 50;
        let intervals = [];
        let count = 0;
        history.forEach(h => {
            if (h.vol > bVol * 1.5) count++;
            else { if(count > 0) intervals.push(count); count = 0; }
        });
        if (intervals.length < 2) return 50;
        // Variance of interval lengths
        const avg = intervals.reduce((a,b)=>a+b,0)/intervals.length;
        const variance = intervals.reduce((a,b)=>a+Math.pow(b-avg,2),0)/intervals.length;
        // Low variance = Highly rhythmic/repetitive = Low Entropy (Bad)
        return Math.max(0, 100 - (variance * 2));
    };
    const entropyPenalty = getEntropy();

    // 3. SEMANTIC SPACE COMPRESSION (Pause-to-Phoneme)
    const getCompression = () => {
        const active = history.filter(h => h.vol > bVol * 1.2).length;
        const ratio = active / history.length; // % of time spent talking
        return ratio * 100; 
    };
    const compressionRatio = getCompression();

    // 4. MOMENTUM & HOLD
    const momentum = (Math.max(0, history[history.length-1].vol - history[0].vol)) * 5;
    const holdPressure = ((history.reduce((a,b)=>a+b.vol,0)/history.length) - bVol) / bVol * 100;

    // 5. NON-LINEAR FUSION MATRIX
    // Instead of linear addition, we use "Co-occurrence Multiplication"
    // If you are loud (hold) AND fast (compression), the score compounds.
    
    let baseFusion = (holdPressure * 0.3) + (compressionRatio * 0.3) + (jitterFactor * 0.2) + (entropyPenalty * 0.2);
    
    // Synergy Multiplier: If Jitter and Compression are both high, boost the danger
    if (jitterFactor > 40 && compressionRatio > 60) {
        baseFusion *= 1.4; 
    }

    return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            fusionScore: Math.min(100, baseFusion),
            momentum: momentum,
            volatility: jitterFactor, // Reflected as volatility in the UI
            holdPressure: Math.max(0, holdPressure),
            compression: compressionRatio
        })
    };
};
