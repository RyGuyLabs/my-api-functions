/**
 * RYGUYLABS BEHAVIORAL SYSTEMS: PACING MODULES
 * VERSION: 2.0.1 - BUNDLER COMPATIBILITY FIX
 */

exports.handler = async function(event, context) {
    // Explicit CORS headers for cross-domain communication
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
        "Content-Type": "application/json"
    };

    // 1. Handle Preflight OPTIONS
    if (event.httpMethod === "OPTIONS") {
        return {
            statusCode: 200,
            headers: headers,
            body: JSON.stringify({ status: "ready" })
        };
    }

    // 2. Handle simple GET request for health check
    if (event.httpMethod === "GET") {
        return {
            statusCode: 200,
            headers: headers,
            body: JSON.stringify({ status: "online", engine: "RyGuyLabs Pacing 2.0" })
        };
    }

    // 3. Handle POST logic
    if (event.httpMethod === "POST") {
        try {
            if (!event.body) {
                return { statusCode: 400, headers: headers, body: JSON.stringify({ error: "Missing body" }) };
            }

            const data = JSON.parse(event.body);
            
            // Extract with defaults to prevent NaN errors
            const time = parseFloat(data.time) || 0;
            const outcome = parseFloat(data.outcome) || 0;
            const questions = parseFloat(data.questions) || 0;
            const exit = parseFloat(data.exit) || 0;
            const phase = parseFloat(data.phase) || 1;
            const medium = parseFloat(data.medium) || 1;

            // Proprietary Calculation
            const exitPressure = 100 - exit;
            const score = Math.min(100, Math.round(
                ((time * 0.3) + (outcome * 0.3) + (questions * 0.2) + (exitPressure * 0.2)) * phase * medium
            ));

            let responseData = {
                score: score,
                label: "CALIBRATED",
                color: "#00ff88",
                recommendation: "OPTIMAL: The conversation is in a high-trust state. Maintain current trajectory."
            };

            if (score > 75) {
                responseData.label = "OVERHEATED";
                responseData.color = "#ff3300";
                responseData.recommendation = "CRITICAL: High reactance detected. Release all pressure immediately.";
            } else if (score > 45) {
                responseData.label = "COMPRESSED";
                responseData.color = "#ffcc00";
                responseData.recommendation = "CAUTION: Friction is building. Use tactical empathy to lower defenses.";
            }

            return {
                statusCode: 200,
                headers: headers,
                body: JSON.stringify(responseData)
            };

        } catch (err) {
            return {
                statusCode: 500,
                headers: headers,
                body: JSON.stringify({ error: "Calculation Error", details: err.message })
            };
        }
    }

    // Fallback
    return {
        statusCode: 405,
        headers: headers,
        body: JSON.stringify({ error: "Method not allowed" })
    };
};
