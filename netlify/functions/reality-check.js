/**
 * Status-O-Meter | Logic Engine
 * PATH: /.netlify/functions/reality-check
 */

exports.handler = async (event) => {
    // CRITICAL: Robust CORS headers to allow Squarespace to communicate
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json"
    };

    // Handle Pre-flight OPTIONS request from Browser
    if (event.httpMethod === "OPTIONS") {
        return {
            statusCode: 204,
            headers
        };
    }

    try {
        if (!event.body) throw new Error("Missing Payload");
        
        const body = JSON.parse(event.body);
        const { selections, targetName, targetWin } = body;

        // Calculate total audit score (Sum of values)
        const totalScore = (selections || []).reduce((a, b) => a + Number(b), 0);

        let result = {
            totalScore: totalScore,
            title: "",
            desc: "",
            quote: "",
            color: "#00f2ff"
        };

        // RYGUY LOGIC ENGINE - SECURE CALCULATIONS
        if (totalScore >= 65) {
            result.title = "The Golden Cage";
            result.color = "#ff4d4d";
            result.desc = `Warning: ${targetName}'s win of ${targetWin} is a strategic liability. Our audit indicates high friction, zero ownership, and mental redlining. This is a prison with better branding.`;
            result.quote = "Never envy a man whose 'win' requires him to ask for permission to breathe. Freedom is the only currency that doesn't devalue.";
        } else if (totalScore >= 35) {
            result.title = "The High-Cost Hustle";
            result.color = "#7000ff";
            result.desc = `The achievement of ${targetWin} is real, but the 'Prestige Pain' is mounting. ${targetName} is trading long-term sanity for short-term visibility. The track is cracking.`;
            result.quote = "The crowd sees the trophy; the mirror sees the exhaustion. Make sure the prize is worth the piece of yourself you're trading for it.";
        } else {
            result.title = "Pure Leverage";
            result.color = "#00f2ff";
            result.desc = `Rare alignment detected. ${targetName} has secured ${targetWin} with genuine ownership and low internal friction. This is a map you can actually follow.`;
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
            body: JSON.stringify({ 
                error: "Logic Engine Failure", 
                message: err.message 
            })
        };
    }
};
