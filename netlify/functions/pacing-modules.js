**
 * RYGUYLABS BEHAVIORAL SYSTEMS: PACING MODULES
 * PROTECTED BACKEND LOGIC FOR THE PACE INDEX™
 */

exports.handler = async (event, context) => {
    // 1. Handle Preflight OPTIONS (Required for CORS/Netlify)
    if (event.httpMethod === "OPTIONS") {
        return {
            statusCode: 200,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
            },
            body: "OK",
        };
    }

    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    try {
        const body = JSON.parse(event.body);
        const { time, outcome, questions, exit, phase, medium } = body;

        // PROPRIETARY WEIGHTING
        const exitPressure = 100 - exit;
        const weights = { time: 0.3, outcome: 0.3, questions: 0.2, exit: 0.2 };

        let rawScore = (
            (time * weights.time) + 
            (outcome * weights.outcome) + 
            (questions * weights.questions) + 
            (exitPressure * weights.exit)
        ) * (phase || 1) * (medium || 1);

        const score = Math.min(100, Math.round(rawScore));

        // RECOMMENDATION ENGINE
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
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify(result)
        };

    } catch (error) {
        return { 
            statusCode: 500, 
            body: JSON.stringify({ error: "Processing error", details: error.message }) 
        };
    }
};
