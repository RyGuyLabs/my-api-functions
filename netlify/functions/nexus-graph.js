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

        const raw = JSON.parse(event.body || "{}");

const data = {
    signals: Array.isArray(raw.signals) ? raw.signals : [],
    insight: Array.isArray(raw.insight) ? raw.insight : Array.isArray(raw.insights) ? raw.insights : [],
    actions: Array.isArray(raw.actions) ? raw.actions : [],
    opportunity: typeof raw.opportunity === "string" ? raw.opportunity : ""
};

        const nodes = [];
        const links = [];
        const nodeMap = new Map();

        function calculateRelationshipStrength(sourceLabel = "", targetLabel = "") {

    const source = String(sourceLabel || "").toLowerCase();
    const target = String(targetLabel || "").toLowerCase();

    let score = 0.35;

    const strategicTerms = [
        "ai",
        "automation",
        "systems",
        "security",
        "network",
        "infrastructure",
        "intelligence",
        "finance",
        "analytics",
        "data",
        "strategy",
        "growth",
        "scaling"
    ];

    strategicTerms.forEach(term => {

        if (source.includes(term) && target.includes(term)) {
            score += 0.12;
        }

    });

    // Shared word amplification
    const sourceWords = source.split(" ");
    const targetWords = target.split(" ");

    sourceWords.forEach(word => {

        if (
            word.length > 3 &&
            targetWords.includes(word)
        ) {
            score += 0.08;
        }

    });

    return Math.max(0.2, Math.min(score, 1));
}

        function calculateStrategicScore(node, links) {

    let score = 0;

    // Base type weighting
    switch(node.type) {

        case "signal":
            score += 18;
            break;

        case "insight":
            score += 35;
            break;

        case "opportunity":
            score += 55;
            break;

        case "action":
            score += 28;
            break;
    }

    const connectedLinks = links.filter(link => {

    const sourceId =
        typeof link.source === "object" ? link.source.id : link.source;

    const targetId =
        typeof link.target === "object" ? link.target.id : link.target;

    const nodeId =
        typeof node.id === "object" ? node.id.id : node.id;

    return sourceId === nodeId || targetId === nodeId;
});

    score += connectedLinks.length * 6;

    // Relationship strength amplification
    connectedLinks.forEach(link => {
        score += Math.round((link.strength || 0.3) * 14);
    });

    // Weight amplification
    score += Math.round((node.weight || 0.5) * 20);

    return Math.min(score, 100);
}
        function calculateNodeWeight(type, label = "") {

    const normalized = String(label || "").toLowerCase();

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

            nodeMap.set(signalId, {
    id: signalId,
    type: "signal",
    label: signal,
    weight: calculateNodeWeight("signal", signal)
});

            // CONNECT TO INSIGHTS
            data.insight.forEach((insight, j) => {

                const insightId = `insight_${j}`;

                if (!nodeMap.has(insightId)) {

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
                    strength: calculateRelationshipStrength(signal, insight)
                });

            });

        });

        // OPPORTUNITY
        if (data.opportunity) {

            const oppId = "opportunity_main";

            nodeMap.set(insightId, {
                id: oppId,
                type: "opportunity",
                label: data.opportunity,
                weight: calculateNodeWeight("opportunity", data.opportunity)
            });

            data.insight.forEach((_, j) => {

                links.push({
                    source: `insight_${j}`,
                    target: oppId,
                    strength: calculateRelationshipStrength(
                    data.insight[j],
                    data.opportunity
            )
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
                strength: calculateRelationshipStrength(
                data.opportunity,
                action
                )
            });

        });

        // STRATEGIC INTELLIGENCE SCORING
nodes.forEach(node => {

    node.strategicScore = calculateStrategicScore(node, links);

    if (node.strategicScore >= 85) {

        node.rank = "Dominant";

    } else if (node.strategicScore >= 70) {

        node.rank = "Strategic";

    } else if (node.strategicScore >= 50) {

        node.rank = "Relevant";

    } else {

        node.rank = "Peripheral";

    }

});

        return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
        nodes: Array.from(nodeMap.values()),
        links
    })
};

    } catch (error) {

        console.error(
    "BUILD NEXUS GRAPH ERROR:",
    error,
    error.stack
);

        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: "Failed to construct Nexus graph."
            })
        };

    }

};
