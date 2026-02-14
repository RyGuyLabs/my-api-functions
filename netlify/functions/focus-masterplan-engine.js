/**
 * Focus Masterplan Engine - Logic Extraction
 * Path: /netlify/functions/focus-masterplan-engine.js
 */

exports.handler = async (event) => {
    // CORS Handling for ryguylabs.com
    const origin = event.headers.origin || event.headers.Origin || "";
    const allowedOrigins = ["https://ryguylabs.com", "https://www.ryguylabs.com"];
    const accessControlOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

    const headers = {
        "Access-Control-Allow-Origin": accessControlOrigin,
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json"
    };

    if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers };

    try {
        const payload = JSON.parse(event.body);
        const { area, today, impact, boundary, target, step } = payload;

        // --- STEP 2 LOGIC: ANALYTICAL OUTPUT ---
        if (step === 2) {
            const focusDirective = impact ? `Focus your energy on: "${impact}". This is where your leverage compounds.` : '';
            const strategicPermission = today ? `It's okay to ignore distractions that do not move "${today}" forward.` : '';
            const cognitiveRisk = today || impact ? `Beware of overloading your attention. Fragmentation dilutes results.` : '';
            const thoughtPlan = (today || impact) ? `Plan: execute daily small wins, protect focus, review direction weekly.` : '';

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    focusDirective,
                    strategicPermission,
                    cognitiveRisk,
                    thoughtPlan
                })
            };
        }

        // --- STEP 4 LOGIC: ENRICHED SUMMARY ---
        if (step === 4) {
            const bulletsHTML = `
                <ul class="space-y-3 md:space-y-4 text-left">
                    <li class="bg-blue-500/20 p-3 rounded-lg border border-blue-500/40">
                        💡 <span class="font-bold">Focus Directive:</span> Protect your energy and focus on <span class="underline">${impact || "key high-impact areas"}</span>.
                        <p class="text-sm text-white/70 mt-1">Stay consistent and prioritize what moves the needle.</p>
                    </li>
                    <li class="bg-green-500/20 p-3 rounded-lg border border-green-500/40">
                        ⚡ <span class="font-bold">Energy Alignment:</span> Today, aim to achieve <span class="underline">${today || "small wins"}</span>.
                        <p class="text-sm text-white/70 mt-1">Momentum compounds with every micro-action.</p>
                    </li>
                    <li class="bg-purple-500/20 p-3 rounded-lg border border-purple-500/40">
                        🛡️ <span class="font-bold">Boundary Enforcement:</span> "${boundary || "Set limits to protect focus"}".
                        <p class="text-sm text-white/70 mt-1">Boundaries safeguard your energy from distractions.</p>
                    </li>
                    <li class="bg-red-500/20 p-3 rounded-lg border border-red-500/40">
                        🎯 <span class="font-bold">90-Day Target:</span> "${target || "Define a clear outcome in 3 months"}".
                        <p class="text-sm text-white/70 mt-1">Keep your eyes on the goal and track progress weekly.</p>
                    </li>
                </ul>
            `;

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ bulletsHTML })
            };
        }

    } catch (err) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "Logic Error", details: err.message })
        };
    }
};
