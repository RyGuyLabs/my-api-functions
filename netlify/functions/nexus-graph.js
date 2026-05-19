exports.handler = async (event) => {

    // CORS HEADERS
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
    };

    // HANDLE PREFLIGHT
    if (event.httpMethod === "OPTIONS") {
        return {
            statusCode: 200,
            headers,
            body: ""
        };
    }

    try {

        const data = JSON.parse(event.body);

        const nodes = [];
        const links = [];

        function calculateNodeWeight(type, label = "") {

    const normalized = label.toLowerCase();

    let base = 0.7;

    switch(type) {

        case "signal":
            base = 0.55;
            break;

        case "insight":
            base = 0.82;
            break;

        case "opportunity":
            base = 1;
            break;

        case "action":
            base = 0.74;
            break;
    }

    // Intelligence amplification
    if (
        normalized.includes("ai") ||
        normalized.includes("automation") ||
        normalized.includes("infrastructure") ||
        normalized.includes("security") ||
        normalized.includes("systems")
    ) {
        base += 0.12;
    }

    // Market scarcity amplification
    if (
        normalized.includes("rare") ||
        normalized.includes("high leverage") ||
        normalized.includes("strategic")
    ) {
        base += 0.08;
    }

    // Clamp
    return Math.max(0.45, Math.min(base, 1.2));
}

        // SIGNALS
        data.signals.forEach((signal, i) => {

            const signalId = `signal_${i}`;

            nodes.push({
                id: signalId,
                type: "signal",
                label: signal,
                weight: calculateNodeWeight("signal", signal)
            });

            // CONNECT TO INSIGHTS
            data.insight.forEach((insight, j) => {

                const insightId = `insight_${j}`;

                if (!nodes.find(n => n.id === insightId)) {

                    nodes.push({
                        id: insightId,
                        type: "insight",
                        label: insight,
                        weight: calculateNodeWeight("insight", insight)
                    });

                }

                links.push({
                    source: signalId,
                    target: insightId,
                    strength: 0.6
                });

            });

        });

        // OPPORTUNITY
        if (data.opportunity) {

            const oppId = "opportunity_main";

            nodes.push({
                id: oppId,
                type: "opportunity",
                label: data.opportunity,
                weight: calculateNodeWeight("opportunity", data.opportunity)
            });

            data.insight.forEach((_, j) => {

                links.push({
                    source: `insight_${j}`,
                    target: oppId,
                    strength: 0.9
                });

            });

        }

        // ACTIONS
        data.actions.forEach((action, i) => {

            const actionId = `action_${i}`;

            nodes.push({
                id: actionId,
                type: "action",
                label: action,
                weight: calculateNodeWeight("action", action)
            });

            links.push({
                source: "opportunity_main",
                target: actionId,
                strength: 0.7
            });

        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                nodes,
                links
            })
        };

    } catch (error) {

        console.error("BUILD NEXUS GRAPH ERROR:", error);

        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: "Failed to construct Nexus graph."
            })
        };

    }

};
