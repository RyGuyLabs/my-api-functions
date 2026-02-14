exports.handler = async (event) => {
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json"
    };

    if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers };

    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(2, 10);

    try {
        if (!event.body) throw new Error("Missing request body");

        const data = JSON.parse(event.body);

        const {
            area = "",
            today = "",
            impact = "",
            boundary = "",
            target = "",
            step
        } = data;

        // --- BASIC SANITIZER ---
        const clean = (str) =>
            String(str)
                .replace(/[<>]/g, "")
                .trim()
                .slice(0, 300);

        const safe = {
            area: clean(area),
            today: clean(today),
            impact: clean(impact),
            boundary: clean(boundary),
            target: clean(target)
        };

        // --- PHRASE VARIATION ENGINE ---
        const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

        // --- VALIDATION BY STEP ---
        const requireFields = (fields) => {
            for (const f of fields) {
                if (!safe[f] && safe[f] !== 0) {
                    throw new Error(`Missing required field: ${f}`);
                }
            }
        };

        // =============================
        // ALGORITHM 1 — STRATEGIC AUDIT
        // =============================
        if (step === 2) {

            requireFields(["area", "impact", "today"]);

            const audit = {
                directive: pick([
                    `The ${safe.area} theater requires absolute focus. Prioritize "${safe.impact}" above all else.`,
                    `All momentum must consolidate around "${safe.impact}" inside the ${safe.area} domain.`,
                    `Strategic dominance in ${safe.area} requires total commitment to "${safe.impact}".`
                ]),

                permission: pick([
                    `You are authorized to ignore anything not directly enabling "${safe.today}".`,
                    `Non-aligned requests are operational noise. Discard anything outside "${safe.today}".`,
                    `If it doesn't move "${safe.today}" forward — it is not your concern today.`
                ]),

                risk: pick([
                    `Fragmented attention here delays ${safe.area} advancement by weeks.`,
                    `Context switching will sabotage velocity inside ${safe.area}.`,
                    `Dilution of focus will extend your ${safe.area} timeline significantly.`
                ]),

                meta: {
                    step: 2,
                    urgencyScore: 0.85,
                    requestId
                }
            };

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(audit)
            };
        }

        // =============================
        // ALGORITHM 2 — FINAL SYNTHESIS
        // =============================
        if (step === 4) {

            requireFields(["target", "impact", "today", "boundary"]);

            const protocol = `
                <div class="space-y-6">
                    <div class="border-l-4 border-blue-500 pl-4">
                        <h4 class="text-blue-400 font-bold uppercase text-xs">Primary Mission</h4>
                        <p class="text-lg">
                            Achieve "${safe.target}" by maximizing "${safe.impact}".
                        </p>
                    </div>

                    <div class="border-l-4 border-purple-500 pl-4">
                        <h4 class="text-purple-400 font-bold uppercase text-xs">Daily Execution</h4>
                        <p>
                            Complete "${safe.today}" before engaging in any low-leverage activity.
                        </p>
                    </div>

                    <div class="border-l-4 border-red-500 pl-4">
                        <h4 class="text-red-400 font-bold uppercase text-xs">Operational Boundary</h4>
                        <p>
                            Reject: "${safe.boundary}". Protect cognitive bandwidth aggressively.
                        </p>
                    </div>
                </div>
            `;

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    protocol,
                    meta: {
                        step: 4,
                        confidence: 0.92,
                        executionMode: "focused",
                        requestId
                    }
                })
            };
        }

        throw new Error("Invalid step provided");

    } catch (err) {

        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: err.message,
                requestId
            })
        };
    } finally {
        const duration = Date.now() - startTime;
        console.log(`Request ${requestId} completed in ${duration}ms`);
    }
};
