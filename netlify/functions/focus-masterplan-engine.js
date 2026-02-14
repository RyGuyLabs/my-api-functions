/**
 * Focus Masterplan Engine - Version 6.0 (Production Logs & CORS Fix)
 * Path: /netlify/functions/focus-masterplan-engine.js
 */

exports.handler = async (event) => {
    // 1. DYNAMIC CORS HANDLING
    const origin = event.headers.origin || event.headers.Origin;
    const allowedOrigins = ["https://ryguylabs.com", "https://www.ryguylabs.com"];
    
    // Fallback to the requested origin if it's one of ours, otherwise default to the primary
    const accessControlOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

    const headers = {
        "Access-Control-Allow-Origin": accessControlOrigin,
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json"
    };

    // 2. LOGGING FOR DEBUGGING (This will show up in Netlify Logs)
    console.log(`[ENGINE] Request Received: ${event.httpMethod} from ${origin}`);

    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 204, headers };
    }

    if (event.httpMethod !== "POST") {
        console.error(`[ENGINE] Invalid Method: ${event.httpMethod}`);
        return { statusCode: 405, headers, body: JSON.stringify({ error: "Method Not Allowed" }) };
    }

    try {
        const payload = JSON.parse(event.body);
        const { area, today, impact, boundary, target, step } = payload;
        
        console.log(`[ENGINE] Processing Step ${step} for Area: ${area}`);

        // --- INTERNAL LOGIC ENGINE ---
        const framework = {
            Career: { logic: "Eisenhower-Matrix Optimization", failure: "Decision Fatigue", rule: "90-Min Deep Work" },
            Creativity: { logic: "Flow-State Iteration", failure: "Perfectionist Stalling", rule: "Rapid Prototyping" },
            Health: { logic: "Biological Primalism", failure: "Sleep/Energy Debt", rule: "Circadian Alignment" },
            Social: { logic: "High-Value Synthesis", failure: "Low-Yield Drainage", rule: "Network Pruning" }
        };

        const active = framework[area] || framework.Career;

        if (step === 2) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    focusDirective: `AUDIT: System detected "${impact}" as the primary lever for ${area}.`,
                    strategicPermission: `PROTOCOL: Activate ${active.rule}. Ignore all non-essential communication.`,
                    cognitiveRisk: `FAILURE ALERT: High probability of ${active.failure} today.`,
                    thoughtPlan: `PHASE 1: Execute "${today}" as the lead-in to ${impact}.`
                })
            };
        }

        if (step === 4) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    bulletsHTML: `
                        <div class="space-y-4 text-sm">
                            <div class="p-3 border border-blue-500/30 bg-blue-500/5 rounded">
                                <h4 class="text-xs font-bold text-blue-400 mb-1 uppercase tracking-widest">Masterplan Active</h4>
                                <p class="text-white/80">Applying <strong>${active.logic}</strong> to achieve "${target}".</p>
                            </div>
                            <div class="p-3 border border-purple-500/30 bg-purple-500/5 rounded">
                                <h4 class="text-xs font-bold text-purple-400 mb-1 uppercase tracking-widest">Energy Shield</h4>
                                <p class="text-white/80">Boundary: "${boundary}". Failure to enforce this will trigger <strong>${active.failure}</strong>.</p>
                            </div>
                            <div class="mt-4 pt-4 border-t border-white/10 text-center text-[10px] text-white/40 uppercase tracking-[0.4em]">
                                Verified by RyGuyLabs // Strat-Engine
                            </div>
                        </div>
                    `
                })
            };
        }

    } catch (err) {
        console.error(`[ENGINE] Runtime Error: ${err.message}`);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "Logic Engine Fault", message: err.message })
        };
    }
};
