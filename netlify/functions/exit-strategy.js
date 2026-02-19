/**
 * RyGuyLabs - Clean Exit Strategy
 * Production-Grade Backend: Strategic Intervention Logic
 * * Logic Tiers:
 * 1. GREEN:  Steady Pace (Low Risk)
 * 2. YELLOW: Warning Sign (Tread Softly)
 * 3. ORANGE: Heavy Drain (Strategic Realignment)
 * 4. RED:    Total Hemorrhage (Clean Exit Required)
 */

exports.handler = async (event, context) => {
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json"
    };

    if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "OK" };

    try {
        const body = JSON.parse(event.body);
        const target = body.target || "this project";
        const weeklyHours = Math.abs(parseFloat(body.hours)) || 0;
        const hourlyRate = Math.abs(parseFloat(body.rate)) || 0;
        const directExpenses = Math.abs(parseFloat(body.expenses)) || 0;
        const missedProfits = Math.abs(parseFloat(body.missedProfit)) || 0;

        // --- CALCULATIONS ---
        
        // 1. "Working for Free" (The value of the time you gave away)
        const yearlyHours = weeklyHours * 52;
        const unpaidLaborValue = yearlyHours * hourlyRate;
        
        // 2. "The Cash Leak" (Money out of pocket + Money you didn't make elsewhere)
        const annualCashOut = directExpenses; 
        const opportunityLoss = missedProfits;
        const totalHiddenBill = annualCashOut + opportunityLoss;
        
        // 3. "The Price of Staying" (Total yearly cost to your life)
        const totalPriceOfStaying = unpaidLaborValue + totalHiddenBill;

        // 4. "The Life-Lease Ratio" (How much of your 100% capacity is this taking?)
        // Assuming a standard high-performance work year is ~2000 hours
        const lifeLeasePercent = Math.min(((yearlyHours / 2000) * 100), 100).toFixed(1);

        // --- MULTI-TIER VERDICT LOGIC ---
        let tier = "";
        let advice = "";
        let color = "";
        let severity = 0; // 1-4 scale for the graph

        if (totalPriceOfStaying < (hourlyRate * 200)) {
            // GREEN TIER
            tier = "Steady Pace";
            color = "#00ffe1"; 
            severity = 1;
            advice = `You are handling "${target}" well. It isn't draining your life or your wallet yet. Keep going, but keep a close eye on your clock. Don't let a hobby turn into a trap.`;
        } 
        else if (totalPriceOfStaying < (hourlyRate * 600)) {
            // YELLOW TIER
            tier = "Tread Softly";
            color = "#fbbf24"; // Amber
            severity = 2;
            advice = `Warning: You are starting to pay more for "${target}" than it is paying you. You are "investing" time you'll never get back. Set a 30-day deadline: if it doesn't make money or progress by then, you must change your approach.`;
        }
        else if (totalPriceOfStaying < (hourlyRate * 1200)) {
            // ORANGE TIER
            tier = "Heavy Drain";
            color = "#f97316"; // Orange
            severity = 3;
            advice = `This is no longer a project; it's a resource leak. You are burning your most precious resource—time—on something that is slowing you down. You are addicted to the "idea" of this, but the math says it's hurting your future. It's time to realign.`;
        }
        else {
            // RED TIER
            tier = "Clean Exit Required";
            color = "#ef4444"; // Red
            severity = 4;
            advice = `STOP. You are paying a massive "life-tax" for a project that is going nowhere. You have lost over $${totalPriceOfStaying.toLocaleString()} in value this year alone. This is an anchor. Cut the rope and put this energy into your primary mission before you lose another year.`;
        }

        // --- THE "HARD TRUTH" QUOTES ---
        const quotes = [
            "The time you already spent is gone. You can't buy it back. Stop spending the time you have left.",
            "An obsession is only 'passion' if it produces. Otherwise, it is just a slow way to fail.",
            "You are trading your real life for a dream that isn't paying its rent.",
            "Being busy is not the same as being successful. Are you moving, or just shaking?"
        ];
        const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                target,
                tier,
                color,
                severity,
                advice,
                quote: randomQuote,
                stats: {
                    unpaidLabor: unpaidLaborValue.toLocaleString(),
                    cashLeak: totalHiddenBill.toLocaleString(),
                    totalLoss: totalPriceOfStaying.toLocaleString(),
                    hoursGiven: yearlyHours.toLocaleString(),
                    leaseRatio: lifeLeasePercent
                }
            })
        };

    } catch (error) {
        return { 
            statusCode: 500, 
            headers, 
            body: JSON.stringify({ error: "The diagnostic engine hit a wall. Please try again." }) 
        };
    }
};
