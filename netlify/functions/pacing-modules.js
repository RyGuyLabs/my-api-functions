/**
 * RYGUYLABS BEHAVIORAL SYSTEMS: PACING MODULES
 * PROTECTED BACKEND LOGIC FOR THE PACE INDEX™
 */

exports.handler = async (event) => {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    try {
        const { time, outcome, questions, exit, phase, medium } = JSON.parse(event.body);

        // THE SECRET SAUCE: PROPRIETARY WEIGHTING ALGORITHM
        // We calculate pressure based on raw inputs vs. psychological safety (Exit Permission)
        const exitPressure = 100 - exit;
        const weights = {
            time: 0.3,
            outcome: 0.3,
            questions: 0.2,
            exit: 0.2
        };

        let rawScore = (
            (time * weights.time) + 
            (outcome * weights.outcome) + 
            (questions * weights.questions) + 
            (exitPressure * weights.exit)
        ) * phase * medium;

        const score = Math.min(100, Math.round(rawScore));

        // PROTOCOL LOOKUP TABLE
        let label, color, recommendation;

        if (score > 75) {
            label = "OVERHEATED";
            color = "#ff3300"; // Danger
            recommendation = "CRITICAL: Reactance triggered. The counter-party likely feels cornered. Halt all closing attempts. Pivot to high-autonomy scripts immediately: 'It's completely fine if this isn't a fit right now.'";
        } else if (score > 45) {
            label = "COMPRESSED";
            color = "#ffcc00"; // Warning
            recommendation = "CAUTION: Psychological friction rising. Slow the verbal cadence. Use labeling and silence to lower the perceived cost of the interaction.";
        } else {
            label = "CALIBRATED";
            color = "#00ff88"; // Safe
            recommendation = "OPTIMAL: Behavioral alignment is high. The counter-party feels in control and safe. Proceed at current pace.";
        }

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ score, label, color, recommendation })
        };

    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: "Internal processing error." }) };
    }
};
