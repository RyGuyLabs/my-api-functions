/**
 * Status-O-Meter Logic Engine
 * File: reality-check.js
 * Handles the "Prestige Pain" audit and result synthesis.
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
        const { selections, targetName, targetWin } = data;

        // Calculate total audit score
        const totalScore = selections.reduce((a, b) => a + b, 0);

        let result = {
            totalScore: totalScore,
            title: "",
            desc: "",
            quote: "",
            color: "#00f2ff"
        };

        // THE REALITY CHECK ALGORITHM
        if (totalScore >= 70) {
            result.title = "The Golden Cage";
            result.color = "#ff4d4d"; // High Risk Red
            result.desc = `You are envying a prison. ${targetName}'s win of ${targetWin} comes with heavy leashes and mental redlining. This isn't a win; it's a high-visibility obligation.`;
            result.quote = "Never envy a man whose 'win' requires him to ask for permission to breathe. Freedom is the only currency that doesn't devalue.";
        } else if (totalScore >= 40) {
            result.title = "The High-Cost Hustle";
            result.color = "#7000ff"; // Secondary Glow Purple
            result.desc = `The win of ${targetWin} is real, but the friction is mounting. There is significant 'Prestige Pain' here. It's a race, but the track is crumbling beneath them.`;
            result.quote = "The crowd sees the trophy; the mirror sees the exhaustion. Make sure the prize is worth the piece of yourself you're trading for it.";
        } else {
            result.title = "Pure Leverage";
            result.color = "#00f2ff"; // Primary Glow Blue
            result.desc = `${targetName} seems to have found a rare alignment. The ${targetWin} they've achieved is likely a byproduct of a solid track. Use this as a map, not a mirror.`;
            result.quote = "Comparison is a thief, but observation is a teacher. If the track is right, keep running yours.";
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(result)
        };

    } catch (err) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "Reality Check Engine Failure" })
        };
    }
};
