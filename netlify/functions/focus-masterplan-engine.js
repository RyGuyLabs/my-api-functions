/**
 * Netlify Serverless Function: focus-masterplan-engine.js
 * Version: 2.0 (Heuristic Strategy Edition)
 * No external APIs. Fully self-contained logic.
 */

exports.handler = async (event, context) => {
    const allowedOrigin = "https://ryguylabs.com";
    const headers = {
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json"
    };

    if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers };
    if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: "Method Not Allowed" };

    try {
        const body = JSON.parse(event.body);
        const { area, today, impact, boundary, target, step } = body;

        // --- INTERNAL ENGINE LOGIC ---
        
        // 1. Analyze Input Density (The "Heuristic")
        const inputComplexity = (today?.length || 0) + (impact?.length || 0);
        const intensityScore = inputComplexity > 100 ? "HIGH" : inputComplexity > 40 ? "MODERATE" : "STABILITY";
        
        // 2. Keyword Vectoring (Search for high-performance triggers)
        const powerKeywords = ['scale', 'build', 'launch', 'revenue', 'health', 'code', 'master', 'system'];
        const hasPowerTerm = powerKeywords.some(word => 
            (impact?.toLowerCase().includes(word) || target?.toLowerCase().includes(word))
        );

        let result = {};

        // STEP 2: STRATEGIC NOISE FILTERING
        if (step === 2) {
            // Generate tailored directives based on Priority Area + Intensity
            const directives = {
                Career: {
                    HIGH: "Your trajectory requires radical delegation. If it isn't moving the 'Impact' needle, it's a threat.",
                    STABILITY: "Focus on foundational consistency. Small daily repetitions are your primary leverage."
                },
                Creativity: {
                    HIGH: "You are in a 'Flow-State' build. Block all external inputs for 4-hour windows.",
                    STABILITY: "Lower the stakes. Ship the micro-action today to break the friction of perfectionism."
                },
                Health: {
                    HIGH: "Maximum output requires maximum recovery. Your 'Impact Move' is tied to your biology.",
                    STABILITY: "Consistency over intensity. Do not break the chain of today's micro-win."
                },
                Social: {
                    HIGH: "Focus on high-value networks. Prune low-energy interactions that drain your focus.",
                    STABILITY: "Practice presence. One meaningful interaction outweighs ten surface-level ones."
                }
            };

            const areaSpecific = directives[area] || directives.Career;
            const chosenDirective = intensityScore === "HIGH" ? areaSpecific.HIGH : areaSpecific.STABILITY;

            result = {
                focusDirective: chosenDirective,
                strategicPermission: hasPowerTerm ? 
                    `Optimization detected: Accelerate "${impact}". Ignore minor maintenance tasks.` : 
                    `Permission granted: Focus exclusively on "${today}". Everything else is noise.`,
                cognitiveRisk: intensityScore === "HIGH" ? 
                    "Warning: High cognitive load detected. Risk of burnout is elevated. Enforce strict boundaries." : 
                    "Warning: Momentum stall detected. The risk is 'over-thinking'. Start the micro-action immediately.",
                thoughtPlan: `Engine recommendation: Execute ${today} before 11:00 AM. Review ${impact} results at EOD.`
            };
        }

        // STEP 4: FINAL MASTERPLAN SYNTHESIS (THE "PROTOCOL")
        if (step === 4) {
            // Determine Protocol Type
            let protocolName = "MOMENTUM PROTOCOL";
            let accentColor = "blue";
            
            if (intensityScore === "HIGH" && hasPowerTerm) {
                protocolName = "ARCHITECT EXPANSION PROTOCOL";
                accentColor = "purple";
            } else if (intensityScore === "STABILITY") {
                protocolName = "CONSISTENCY CHAIN PROTOCOL";
                accentColor = "green";
            }

            result = {
                bulletsHTML: `
                    <div class="mb-6 border-b border-white/10 pb-4">
                        <span class="text-xs font-bold tracking-[0.2em] text-${accentColor}-400 uppercase">Active Engine Protocol</span>
                        <h3 class="text-2xl font-bold text-white">${protocolName}</h3>
                    </div>
                    <ul class="space-y-4 text-left">
                        <li class="bg-${accentColor}-500/10 p-4 rounded-xl border border-${accentColor}-500/30">
                            <div class="flex items-start gap-3">
                                <span class="text-xl">🎯</span>
                                <div>
                                    <span class="block font-bold text-white">Execution Priority</span>
                                    <p class="text-sm text-white/70">The system has identified <span class="text-white underline">${impact}</span> as your 80/20 leverage point. 
                                    ${intensityScore === 'HIGH' ? 'Maintain aggressive focus.' : 'Focus on starting, not finishing.'}</p>
                                </div>
                            </div>
                        </li>
                        <li class="bg-white/5 p-4 rounded-xl border border-white/10">
                            <div class="flex items-start gap-3">
                                <span class="text-xl">🛡️</span>
                                <div>
                                    <span class="block font-bold text-white">Energy Guardrail</span>
                                    <p class="text-sm text-white/70">"${boundary}". <strong>Logic:</strong> This boundary prevents decision fatigue and protects your peak energy hours.</p>
                                </div>
                            </div>
                        </li>
                        <li class="bg-${accentColor}-900/20 p-4 rounded-xl border border-${accentColor}-500/20">
                            <div class="flex items-start gap-3">
                                <span class="text-xl">🚀</span>
                                <div>
                                    <span class="block font-bold text-white">90-Day Trajectory</span>
                                    <p class="text-sm text-white/70">Target: <span class="italic text-white">"${target}"</span>. 
                                    Daily compounding of "${today}" leads to a ${hasPowerTerm ? '10x' : 'significant'} increase in success probability.</p>
                                </div>
                            </div>
                        </li>
                    </ul>
                `
            };
        }

        return { statusCode: 200, headers, body: JSON.stringify(result) };

    } catch (err) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
