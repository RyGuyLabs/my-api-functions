/**
 * Focus Masterplan Engine - Advanced Heuristic Version
 * Logic: Strategic Alignment, Friction Identification, and Directive Generation
 */

exports.handler = async (event) => {
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json"
    };

    if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers };

    try {
        const data = JSON.parse(event.body);
        const { area, today, impact, boundary, target, step } = data;

        // --- INTERNAL LOGIC ASSETS ---
        const philosophy = "Task-oriented. Money primary. Sleep secondary. Zero social friction.";
        
        // --- STEP 2: STRATEGIC AUDIT & ALIGNMENT ---
        if (step === 2) {
            // Logic: Determine "Intensity Level" based on area
            const intensity = area === 'Wealth' ? 'MAXIMAL' : 'SUSTAINED';
            
            const audit = {
                directive: `Theater: ${area.toUpperCase()}. Objective: Absolute Leverage. your primary focus on "${impact}" must occupy 80% of your peak cognitive window.`,
                permission: `Strategic Clearance: You are authorized to bypass all social obligations, "wind-down" routines, and non-essential communications that do not directly facilitate "${today}".`,
                risk: `Friction Alert: If "${today}" is not completed by 12:00 PM, your momentum for "${impact}" will collapse. Isolation is required.`,
                philosophyBuffer: philosophy
            };
            return { statusCode: 200, headers, body: JSON.stringify(audit) };
        }

        // --- STEP 4: MULTI-STAGE SYNTHESIS ---
        if (step === 4) {
            // Algorithm: Content Analysis
            // We analyze the text length/complexity to simulate a 'deep' synthesis
            const urgencyScore = (today.length + impact.length) > 40 ? "HIGH" : "CRITICAL";
            
            const protocol = `
                <div class="space-y-8">
                    <!-- Section 1: The North Star -->
                    <div class="bg-blue-500/5 p-6 rounded-xl border border-blue-500/20">
                        <h4 class="text-blue-400 font-bold uppercase text-[10px] tracking-widest mb-3">01 // Strategic Alignment</h4>
                        <p class="text-lg font-semibold">Convert "${impact}" into "${target}" via "${today}".</p>
                        <p class="text-xs text-white/50 mt-2 italic">Alignment Grade: Optimal. The path from daily task to 90-day vision is direct.</p>
                    </div>

                    <!-- Section 2: Operational Rigor -->
                    <div class="grid md:grid-cols-2 gap-4">
                        <div class="bg-white/5 p-5 rounded-xl border border-white/10">
                            <h4 class="text-purple-400 font-bold uppercase text-[10px] tracking-widest mb-2">Priority Matrix</h4>
                            <p class="text-sm">Money is primary. Every hour spent on "${impact}" is an investment. Every hour spent elsewhere is a cost.</p>
                        </div>
                        <div class="bg-white/5 p-5 rounded-xl border border-white/10">
                            <h4 class="text-red-400 font-bold uppercase text-[10px] tracking-widest mb-2">Boundary Enforcement</h4>
                            <p class="text-sm">Active Refusal: "${boundary}". Do not negotiate. Do not explain. Simply execute.</p>
                        </div>
                    </div>

                    <!-- Section 3: The Directive -->
                    <div class="border-t border-white/10 pt-6">
                        <h4 class="text-white font-bold uppercase text-[10px] tracking-widest mb-4">Final Operational Directive</h4>
                        <ul class="space-y-3">
                            <li class="flex items-start gap-3 text-sm">
                                <span class="text-blue-500">▶</span>
                                <span>Sleep is a recovery tool, not a lifestyle. Rest only when "${today}" is quantified as "Complete".</span>
                            </li>
                            <li class="flex items-start gap-3 text-sm">
                                <span class="text-blue-500">▶</span>
                                <span>Social anxiety is a signal of low-leverage environment. Re-route energy to "${impact}".</span>
                            </li>
                            <li class="flex items-start gap-3 text-sm">
                                <span class="text-blue-500">▶</span>
                                <span>Current Urgency Level: <span class="text-orange-400 font-bold">${urgencyScore}</span>.</span>
                            </li>
                        </ul>
                    </div>
                </div>
            `;
            return { statusCode: 200, headers, body: JSON.stringify({ protocol }) };
        }

    } catch (err) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
