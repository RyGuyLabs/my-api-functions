/**
 * RYGUYLABS BEHAVIORAL SYSTEMS: PROFILE PACE FRAMEWORK (V2.0)
 * PROPRIETARY CALIBRATION LOGIC - BACKEND MODULE
 */

exports.handler = async function(event, context) {
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
        "Content-Type": "application/json"
    };

    if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers };

    // Standard Handshake
    if (event.httpMethod === "GET") {
        return { statusCode: 200, headers, body: JSON.stringify({ status: "online", version: "2.0.0" }) };
    }

    if (event.httpMethod === "POST") {
        try {
            const data = JSON.parse(event.body);
            
            // Inputs from the frontend
            const a = parseFloat(data.attach) || 50;
            const t = parseFloat(data.time) || 50;
            const e = parseFloat(data.exit) || 50;
            
            // The Secret Algorithm
            const globalScore = Math.min(100, Math.round((a * 0.4) + (t * 0.4) + (100 - e) * 0.4));

            // Proprietary Content Library
            const quotes = [
                "“Pressure feels like efficiency. Trust is actually efficiency.”",
                "“The fastest closers are the ones who know exactly when to stop pushing.”",
                "“If the exit isn't clear, the entrance isn't safe.”",
                "“Conviction is quiet. Desperation is loud.”"
            ];

            let response = {
                score: globalScore,
                quote: quotes[Math.floor(Math.random() * quotes.length)],
                headline: `Operating at ${globalScore}% Pressure.`
            };

            // Diagnostic Logic
            if (globalScore > 65) {
                response.color = "#ff3300"; // Danger
                response.means = "Chasing frequency detected. This creates reflexive push-back in high-status prospects.";
                response.shift = "Explicitly offer a 'No' option in the next 2 minutes of conversation.";
            } else if (globalScore > 40) {
                response.color = "#ffcc00"; // Warning
                response.means = "Healthy momentum. Watch for 'polite' agreement that masks true internal resistance.";
                response.shift = "Pause for 3 full seconds after they finish their next answer.";
            } else {
                response.color = "#00ff88"; // Safe
                response.means = "Maximum Trust frequency. High autonomy is established. Proceed with deep discovery.";
                response.shift = "Ask: 'What happens if we do absolutely nothing about this today?'";
            }

            return {
                statusCode: 200,
                headers: headers,
                body: JSON.stringify(response)
            };

        } catch (err) {
            return { statusCode: 500, headers, body: JSON.stringify({ error: "Logic Error" }) };
        }
    }

    return { statusCode: 405, headers, body: "Method Not Allowed" };
};
