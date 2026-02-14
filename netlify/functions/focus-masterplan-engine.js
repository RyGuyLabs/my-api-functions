exports.handler = async (event) => {

    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json"
    };

    if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers };

    const requestId = Math.random().toString(36).substring(2, 10);
    const startTime = Date.now();

    try {

        if (!event.body) throw new Error("Missing body");

        const data = JSON.parse(event.body);

        const {
            area = "",
            today = "",
            impact = "",
            boundary = "",
            target = "",
            step = 0
        } = data;

        // =====================
        // SANITIZATION
        // =====================
        const clean = (s) =>
            String(s || "")
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

        // =====================
        // UTILS
        // =====================
        const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
        const clamp = (n, min = 0, max = 1) => Math.max(min, Math.min(max, n));

        // =====================
        // STRATEGIC STATE ENGINE
        // =====================
        let state = {
            focusDebt: Math.random() * 0.4,
            executionMomentum: Math.random() * 0.6,
            boundaryIntegrity: 0.7 + Math.random() * 0.3,
            strategicClarity: safe.impact.length > 10 ? 0.8 : 0.5
        };

        // =====================
        // LANGUAGE GRAPH
        // =====================
        const GRAPH = {
            authority: [
                "Operational command requires",
                "Strategic dominance demands",
                "Execution protocol requires"
            ],
            focus: [
                "total cognitive priority on",
                "full resource alignment toward",
                "singular execution focus on"
            ],
            risk: [
                "Fragmentation introduces timeline delay.",
                "Deviation increases execution cost.",
                "Context switching compounds failure probability."
            ]
        };

        const generateDirective = () => `
            ${pick(GRAPH.authority)}
            ${pick(GRAPH.focus)}
            "${safe.impact}".
            ${pick(GRAPH.risk)}
        `;

        // =====================
        // TONE ENGINE
        // =====================
        const getTone = () => {

            if (state.executionMomentum > 0.75)
                return "elite";

            if (state.focusDebt > 0.6)
                return "corrective";

            return "standard";
        };

        const TONES = {
            elite: [
                "Momentum confirmed. Maintain dominance.",
                "Execution velocity optimal. Continue pressure."
            ],
            corrective: [
                "Drift detected. Realignment required.",
                "Focus degradation unacceptable. Correct course."
            ],
            standard: [
                "Stay on mission.",
                "Maintain execution discipline."
            ]
        };

        // =====================
        // REINFORCEMENT ENGINE
        // =====================
        const reinforcement = () => {

            if (state.executionMomentum > 0.7)
                return "Progress velocity increasing.";

            if (state.focusDebt > 0.6)
                return "Cognitive fragmentation risk rising.";

            return "Execution stability maintained.";
        };

        // =====================
        // STEP VALIDATION
        // =====================
        const requireFields = (fields) => {
            for (const f of fields) {
                if (!safe[f]) throw new Error(`Missing field: ${f}`);
            }
        };

        // =====================
        // STEP 2 — STRATEGIC AUDIT
        // =====================
        if (step === 2) {

            requireFields(["area", "impact", "today"]);

            const tone = getTone();

            const response = {
                directive: generateDirective(),

                permission: `
                    You are authorized to ignore anything
                    not directly advancing "${safe.today}".
                `,

                risk: pick(GRAPH.risk),

                reinforcement: reinforcement(),

                toneLine: pick(TONES[tone]),

                meta: {
                    tone,
                    urgencyScore: clamp(
                        state.executionMomentum +
                        state.strategicClarity -
                        state.focusDebt
                    ),
                    requestId
                }
            };

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(response)
            };
        }

        // =====================
        // STEP 4 — FINAL PROTOCOL
        // =====================
        if (step === 4) {

            requireFields(["target", "impact", "today", "boundary"]);

            const tone = getTone();

            const protocol = `
                <div class="space-y-6">

                    <div class="border-l-4 border-blue-500 pl-4">
                        <h4 class="text-blue-400 font-bold uppercase text-xs">
                            Primary Mission
                        </h4>
                        <p class="text-lg">
                            Achieve "${safe.target}" via
                            leverage of "${safe.impact}".
                        </p>
                    </div>

                    <div class="border-l-4 border-purple-500 pl-4">
                        <h4 class="text-purple-400 font-bold uppercase text-xs">
                            Daily Execution
                        </h4>
                        <p>
                            Complete "${safe.today}"
                            before engaging secondary tasks.
                        </p>
                    </div>

                    <div class="border-l-4 border-red-500 pl-4">
                        <h4 class="text-red-400 font-bold uppercase text-xs">
                            Operational Boundary
                        </h4>
                        <p>
                            Reject: "${safe.boundary}".
                        </p>
                    </div>

                </div>
            `;

            const response = {
                protocol,
                reinforcement: reinforcement(),
                toneLine: pick(TONES[tone]),
                meta: {
                    tone,
                    confidenceScore: clamp(
                        state.strategicClarity +
                        state.executionMomentum +
                        state.boundaryIntegrity
                    ) / 3,
                    requestId
                }
            };

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(response)
            };
        }

        throw new Error("Invalid step");

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
        console.log(
            `Request ${requestId} completed in ${Date.now() - startTime}ms`
        );
    }
};
