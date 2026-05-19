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

        // SIGNALS
        data.signals.forEach((signal, i) => {

            const signalId = `signal_${i}`;

            nodes.push({
                id: signalId,
                type: "signal",
                label: signal,
                weight: 0.7
            });

            // CONNECT TO INSIGHTS
            data.insight.forEach((insight, j) => {

                const insightId = `insight_${j}`;

                if (!nodes.find(n => n.id === insightId)) {

                    nodes.push({
                        id: insightId,
                        type: "insight",
                        label: insight,
                        weight: 0.9
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
                weight: 1
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
                weight: 0.8
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
