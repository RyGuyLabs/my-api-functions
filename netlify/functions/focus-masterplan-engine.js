exports.handler = async (event) => {
    // Basic security headers for local communication
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

        // --- ALGORITHM 1: STRATEGIC AUDIT ---
        if (step === 2) {
            const audit = {
                directive: `The ${area} theater requires absolute focus. Prioritize "${impact}" over all secondary tasks.`,
                permission: `Strategically, you have permission to ignore any request that doesn't facilitate "${today}".`,
                risk: `Fragmenting your attention now will delay your ${area} progress by weeks. Stay linear.`
            };
            return { statusCode: 200, headers, body: JSON.stringify(audit) };
        }

        // --- ALGORITHM 2: FINAL SYNTHESIS ---
        if (step === 4) {
            const protocol = `
                <div class="space-y-6">
                    <div class="border-l-4 border-blue-500 pl-4">
                        <h4 class="text-blue-400 font-bold uppercase text-xs">Primary Mission</h4>
                        <p class="text-lg">Achieve "${target}" by leveraging "${impact}".</p>
                    </div>
                    <div class="border-l-4 border-purple-500 pl-4">
                        <h4 class="text-purple-400 font-bold uppercase text-xs">Daily Execution</h4>
                        <p>Complete "${today}" before engaging in any low-leverage activity.</p>
                    </div>
                    <div class="border-l-4 border-red-500 pl-4">
                        <h4 class="text-red-400 font-bold uppercase text-xs">Operational Boundary</h4>
                        <p>Reject: "${boundary}". Protect your cognitive energy at all costs.</p>
                    </div>
                </div>
            `;
            return { statusCode: 200, headers, body: JSON.stringify({ protocol }) };
        }

    } catch (err) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
