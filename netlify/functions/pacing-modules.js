/**
 * RYGUYLABS BEHAVIORAL SYSTEMS: PACING MODULES
 * ENHANCED WITH FULL CROSS-ORIGIN ACCESS
 */

exports.handler = async (event, context) => {
    // Shared headers for all responses to fix the "Immediate Error" (CORS)
    const headers = {
        "Access-Control-Allow-Origin": "*", // Allows any frontend to call this
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
        "Content-Type": "application/json"
    };

    // 1. Handle Preflight OPTIONS request
    if (event.httpMethod === "OPTIONS") {
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ message: "CORS Preflight OK" })
        };
    }

    if (event.httpMethod !== "POST") {
        return { 
            statusCode: 405, 
            headers, 
            body: JSON.stringify({ error: "Only POST requests allowed" }) 
        };
    }

    try {
        if (!event.body) {
            throw new Error("Missing request body");
        }

        const body = JSON.parse(event.body);
        const { time, outcome, questions, exit, phase, medium } = body;

        // Scoring algorithm logic
        const exitPressure = 100 - (exit || 0);
        const weights = { time: 0.3, outcome: 0.3, questions: 0.2, exit: 0.2 };

        let rawScore = (
            ((time || 0) * weights.time) + 
            ((outcome || 0) * weights.outcome) + 
            ((questions || 0) * weights.questions) + 
            (exitPressure * weights.exit)
        ) * (phase || 1) * (medium || 1);

        const score = Math.min(100, Math.round(rawScore));

        // Result determination
        let result = {
            score: score,
            label: "CALIBRATED",
            color: "#00ff88",
            recommendation: "OPTIMAL: Behavioral alignment is high. The counter-party feels in control and safe."
        };

        if (score > 75) {
            result.label = "OVERHEATED";
            result.color = "#ff3300";
            result.recommendation = "CRITICAL: Reactance triggered. Pivot to high-autonomy scripts: 'It's completely fine if this isn't a fit.'";
        } else if (score > 45) {
            result.label = "COMPRESSED";
            result.color = "#ffcc00";
            result.recommendation = "CAUTION: Psychological friction rising. Slow the verbal cadence. Use labeling and silence.";
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(result)
        };

    } catch (error) {
        return { 
            statusCode: 500, 
            headers,
            body: JSON.stringify({ error: "Processing error", details: error.message }) 
        };
    }
};
