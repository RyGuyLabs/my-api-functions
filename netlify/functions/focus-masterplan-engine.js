/**
 * Focus Masterplan Engine - Version 5.0 (Final Production)
 * Path: /netlify/functions/focus-masterplan-engine.js
 * * 100% SELF-CONTAINED LOGIC. NO EXTERNAL API CALLS.
 * Proprietary Strategic Synthesis Framework.
 */

exports.handler = async (event) => {
    // Production Security Headers
    const headers = {
        "Access-Control-Allow-Origin": "https://ryguylabs.com",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json"
    };

    // Handle Pre-flight
    if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers };

    try {
        const payload = JSON.parse(event.body);
        const { area, today, impact, boundary, target, step } = payload;

        // --- INTERNAL LOGIC ENGINE (NO API) ---
        
        // Strategic framework data (The "Brain" of the app)
        const framework = {
            Career: {
                logic: "Eisenhower-Matrix Optimization",
                primaryFailure: "Prioritizing the Urgent over the Important",
                recoveryRule: "The 4-Hour Deep Work Block"
            },
            Creativity: {
                logic: "Flow-State Iteration",
                primaryFailure: "Premature Optimization / Perfectionism",
                recoveryRule: "The 10-Minute Rapid Start"
            },
            Health: {
                logic: "Biological Primalism",
                primaryFailure: "Energy Depletion via Sleep Neglect",
                recoveryRule: "The Circadian Reset"
            },
            Social: {
                logic: "High-Value Network Synthesis",
                primaryFailure: "Low-Frequency Social Drainage",
                recoveryRule: "Active Boundary Enforcement"
            }
        };

        const activeStrat = framework[area] || framework.Career;

        // Step 2 Logic: Initial Analysis & Audit
        if (step === 2) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    focusDirective: `STRATEGIC AUDIT: Your current plan for ${area} is being processed via ${activeStrat.logic}. Target detected: ${impact}.`,
                    strategicPermission: `PROTOCOL: You are authorized to ignore low-yield interruptions to execute "${today}" immediately.`,
                    cognitiveRisk: `POINT OF FAILURE: System predicts ${activeStrat.primaryFailure} as your main obstacle today.`,
                    thoughtPlan: `PHASE 1: Implementation of ${activeStrat.recoveryRule} initiated.`
                })
            };
        }

        // Step 4 Logic: Final Masterplan Synthesis
        if (step === 4) {
            // Calculated Intensity Index based on input length
            const intensityIndex = ((today?.length || 0) + (impact?.length || 0) + (boundary?.length || 0)) / 100;
            const clarityRating = intensityIndex > 1.5 ? "HIGH DENSITY" : "ACTIONABLE";

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    bulletsHTML: `
                        <div class="space-y-6">
                            <!-- Tactical Header -->
                            <div class="flex justify-between items-center border-b border-white/20 pb-2">
                                <span class="text-[10px] font-bold text-blue-400">PLAN CLARITY: ${clarityRating}</span>
                                <span class="text-[10px] font-bold text-blue-400">LOGIC: ${activeStrat.logic}</span>
                            </div>

                            <!-- The Synthesis -->
                            <div class="p-4 bg-blue-500/10 border-l-4 border-blue-500 rounded-r-lg">
                                <h4 class="text-xs font-bold text-blue-400 uppercase tracking-widest mb-1">Execution Command</h4>
                                <p class="text-sm text-white">
                                    Instead of treating <strong>"${today}"</strong> as a standalone task, treat it as the trigger for <strong>"${impact}"</strong>. 
                                    By applying the ${activeStrat.logic}, you eliminate the "choice-paralysis" usually associated with ${area}.
                                </p>
                            </div>

                            <!-- The Shield -->
                            <div class="p-4 bg-purple-500/10 border-l-4 border-purple-500 rounded-r-lg">
                                <h4 class="text-xs font-bold text-purple-400 uppercase tracking-widest mb-1">Boundary Reinforcement</h4>
                                <p class="text-sm text-white italic">
                                    "${boundary}"
                                </p>
                                <p class="text-[10px] text-white/50 mt-2">
                                    Logic: This boundary is the only thing preventing ${activeStrat.primaryFailure}. Without it, your 90-day target of "${target}" will fail.
                                </p>
                            </div>

                            <!-- Strategic Footnote -->
                            <div class="mt-8 text-center border-t border-white/5 pt-4">
                                <p class="text-[9px] text-white/30 uppercase tracking-[0.3em]">System Intelligence: 2026 Task-Oriented Mode</p>
                            </div>
                        </div>
                    `
                })
            };
        }

    } catch (err) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "Logic Engine Failure", details: err.message })
        };
    }
};
