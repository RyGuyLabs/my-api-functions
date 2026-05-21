exports.handler = async (event) => {

    // =====================================================
    // PRODUCTION CORS LAYER
    // =====================================================

    const CORS_HEADERS = {
        "Access-Control-Allow-Origin": "https://www.ryguylabs.com",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Max-Age": "86400",
        "Vary": "Origin"
    };

    function withCors(response) {

        return {
            ...response,
            headers: {
                ...CORS_HEADERS,
                ...(response.headers || {})
            }
        };

    }

    // =====================================================
    // PREFLIGHT REQUEST HANDLER
    // =====================================================

    if (event.httpMethod === "OPTIONS") {

        return withCors({
            statusCode: 204,
            body: ""
        });

    }

    // =====================================================
    // METHOD VALIDATION
    // =====================================================

    if (event.httpMethod !== "POST") {

        return withCors({
            statusCode: 405,
            body: JSON.stringify({
                error: "Method Not Allowed"
            })
        });

    }

    try {

        const raw = JSON.parse(event.body || "{}");

const data = {
    signals: Array.isArray(raw.signals) ? raw.signals : [],
    insight: Array.isArray(raw.insight) ? raw.insight : Array.isArray(raw.insights) ? raw.insights : [],
    actions: Array.isArray(raw.actions) ? raw.actions : [],
    opportunity: typeof raw.opportunity === "string" ? raw.opportunity : ""
};

        const links = [];
        const nodeMap = new Map();

        function calculateRelationshipStrength(sourceLabel = "", targetLabel = "") {

    const source =
        String(sourceLabel || "").toLowerCase();

    const target =
        String(targetLabel || "").toLowerCase();

    let score = 0.22;

    const strategicTerms = [

        "ai",
        "automation",
        "infrastructure",
        "platform",
        "systems",
        "analytics",
        "intelligence",
        "security",
        "market",
        "growth",
        "scaling",
        "optimization",
        "network",
        "enterprise",
        "revenue",
        "data",
        "sales",
        "engineering",
        "workflow",
        "cloud",
        "saas"

    ];

    strategicTerms.forEach(term => {

        if (
            source.includes(term) &&
            target.includes(term)
        ) {
            score += 0.16;
        }

    });

    // =========================================
    // SHARED TOKEN ANALYSIS
    // =========================================

    const sourceWords =
        source.split(/\s+/);

    const targetWords =
        target.split(/\s+/);

    sourceWords.forEach(word => {

        if (
            word.length > 4 &&
            targetWords.includes(word)
        ) {
            score += 0.1;
        }

    });

    // =========================================
    // STRUCTURAL ALIGNMENT DETECTION
    // =========================================

    const alignmentPairs = [

        ["sales", "engineering"],
        ["automation", "workflow"],
        ["ai", "data"],
        ["cloud", "infrastructure"],
        ["security", "compliance"],
        ["growth", "revenue"],
        ["analytics", "optimization"]

    ];

    alignmentPairs.forEach(pair => {

        const [a, b] = pair;

        const aligned =
            (
                source.includes(a) &&
                target.includes(b)
            ) ||
            (
                source.includes(b) &&
                target.includes(a)
            );

        if (aligned) {
            score += 0.18;
        }

    });

    // =========================================
    // CONTRADICTION DETECTION
    // =========================================

    const contradictionPairs = [

        ["growth", "decline"],
        ["automation", "manual"],
        ["scarcity", "oversupply"],
        ["expansion", "contraction"],
        ["centralized", "decentralized"]

    ];

    contradictionPairs.forEach(pair => {

        const [a, b] = pair;

        const contradiction =
            (
                source.includes(a) &&
                target.includes(b)
            ) ||
            (
                source.includes(b) &&
                target.includes(a)
            );

        if (contradiction) {
            score -= 0.22;
        }

    });

    const lengthDelta =
        Math.abs(
            sourceWords.length -
            targetWords.length
        );

    if (lengthDelta <= 2) {
        score += 0.05;
    }

    return Math.max(
        0.08,
        Math.min(score, 1)
    );
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

    nodeMap.set(insightId, {
        id: insightId,
        type: "insight",
        label: insight,
        weight: calculateNodeWeight("insight", insight)
    });

}

                const relationshipStrength =
    calculateRelationshipStrength(
        signal,
        insight
    );

links.push({

    source: signalId,

    target: insightId,

    strength: relationshipStrength,

    relationship:
        relationshipStrength >= 0.7
            ? "reinforces"
            : relationshipStrength >= 0.45
                ? "correlates"
                : "weak-association",

    confidence:
        Math.round(
            relationshipStrength * 100
        )

});

            });

        });

// OPPORTUNITY NODE
const oppId = "opportunity_main";

// ALWAYS CREATE OPPORTUNITY NODE
nodeMap.set(oppId, {
    id: oppId,
    type: "opportunity",
    label:
        data.opportunity && data.opportunity.trim() !== ""
            ? data.opportunity
            : "Strategic Opportunity",
    weight: calculateNodeWeight(
        "opportunity",
        data.opportunity || "Strategic Opportunity"
    )
});

// CONNECT INSIGHTS → OPPORTUNITY
data.insight.forEach((insight, j) => {

    const insightId = `insight_${j}`;

    // Ensure insight exists
    if (!nodeMap.has(insightId)) {

        nodeMap.set(insightId, {
            id: insightId,
            type: "insight",
            label: insight,
            weight: calculateNodeWeight("insight", insight)
        });

    }

    const relationshipStrength =
    calculateRelationshipStrength(
        insight,
        data.opportunity || "Strategic Opportunity"
    );

links.push({

    source: insightId,

    target: oppId,

    strength: relationshipStrength,

    relationship:
        relationshipStrength >= 0.72
            ? "drives"
            : relationshipStrength >= 0.5
                ? "supports"
                : "weak-support",

    confidence:
        Math.round(
            relationshipStrength * 100
        )

});

});


data.actions.forEach((action, i) => {

    const actionId = `action_${i}`;

    nodeMap.set(actionId, {
        id: actionId,
        type: "action",
        label: action,
        weight: calculateNodeWeight("action", action)
    });

    const relationshipStrength =
    calculateRelationshipStrength(
        data.opportunity || "Strategic Opportunity",
        action
    );

links.push({

    source: oppId,

    target: actionId,

    strength: relationshipStrength,

    relationship:
        relationshipStrength >= 0.72
            ? "executes"
            : relationshipStrength >= 0.5
                ? "enables"
                : "tentative",

    confidence:
        Math.round(
            relationshipStrength * 100
        )

    });

});
    function buildStrategicPaths(nodes, links) {

    const pathways = [];

    const nodeRegistry = {};

    nodes.forEach(node => {
        nodeRegistry[node.id] = node;
    });

    const outgoingMap = {};
    const incomingMap = {};

    links.forEach(link => {

        const sourceId =
            typeof link.source === "object"
                ? link.source.id
                : link.source;

        const targetId =
            typeof link.target === "object"
                ? link.target.id
                : link.target;

        if (!outgoingMap[sourceId]) {
            outgoingMap[sourceId] = [];
        }

        if (!incomingMap[targetId]) {
            incomingMap[targetId] = [];
        }

        outgoingMap[sourceId].push(link);
        incomingMap[targetId].push(link);

    });

    const signals = nodes.filter(n => n.type === "signal");

    signals.forEach(signal => {

        const signalLinks =
            outgoingMap[signal.id] || [];

        signalLinks.forEach(signalLink => {

            const insightId =
                typeof signalLink.target === "object"
                    ? signalLink.target.id
                    : signalLink.target;

            const insightNode =
                nodeRegistry[insightId];

            if (!insightNode) return;

            const insightLinks =
                outgoingMap[insightNode.id] || [];

            insightLinks.forEach(insightLink => {

                const opportunityId =
                    typeof insightLink.target === "object"
                        ? insightLink.target.id
                        : insightLink.target;

                const opportunityNode =
                    nodeRegistry[opportunityId];

                if (!opportunityNode) return;

                const opportunityLinks =
                    outgoingMap[opportunityNode.id] || [];

                opportunityLinks.forEach(opportunityLink => {

                    const actionId =
                        typeof opportunityLink.target === "object"
                            ? opportunityLink.target.id
                            : opportunityLink.target;

                    const actionNode =
                        nodeRegistry[actionId];

                    if (!actionNode) return;

                    
                    const signalStrength =
                        signalLink.strength || 0.3;

                    const insightStrength =
                        insightLink.strength || 0.3;

                    const actionStrength =
                        opportunityLink.strength || 0.3;

                    const chainStrength =
                        (
                            signalStrength +
                            insightStrength +
                            actionStrength
                        ) / 3;

                    // NODE STRATEGIC MASS
                    const nodeMass =
                        (
                            (signal.strategicScore || 50) +
                            (insightNode.strategicScore || 50) +
                            (opportunityNode.strategicScore || 50) +
                            (actionNode.strategicScore || 50)
                        ) / 4;

                    // CONVERGENCE DETECTION
                    const convergenceFactor =
                        (
                            (incomingMap[insightNode.id]?.length || 1) +
                            (incomingMap[opportunityNode.id]?.length || 1)
                        );

                    // OPPORTUNITY EXECUTION ALIGNMENT
                    const executionAlignment =
                        (
                            (opportunityNode.weight || 1) *
                            (actionNode.weight || 1)
                        );

                    // ASYMMETRIC LEVERAGE MODEL
                    let leverageMultiplier = 1;

                    if (
                        opportunityNode.rank === "Dominant" &&
                        actionNode.rank === "Dominant"
                    ) {
                        leverageMultiplier += 0.55;
                    }
                    else if (
                        opportunityNode.rank === "Strategic"
                    ) {
                        leverageMultiplier += 0.28;
                    }

                    // SIGNAL RARITY AMPLIFICATION
                    const rarityBoost =
                        Math.min(
                            1.35,
                            1 + (
                                (
                                    signal.weight || 0.5
                                ) * 0.4
                            )
                        );

                    // FINAL PATHWAY SCORE
                    let pathwayScore =
                        (
                            (chainStrength * 30) +
                            (nodeMass * 0.42) +
                            (convergenceFactor * 4.5) +
                            (executionAlignment * 18)
                        ) * leverageMultiplier * rarityBoost;

                    pathwayScore =
                        Math.round(
                            Math.min(pathwayScore, 100)
                        );

                    // PATHWAY CLASSIFICATION
                    let trajectoryType =
                        "Emergent";

                    if (pathwayScore >= 88) {
                        trajectoryType = "Dominant Strategic Trajectory";
                    }
                    else if (pathwayScore >= 74) {
                        trajectoryType = "High-Leverage Expansion Path";
                    }
                    else if (pathwayScore >= 58) {
                        trajectoryType = "Stable Operational Vector";
                    }

                    pathways.push({

                        signal: signal.label,

                        insight: insightNode.label,

                        opportunity: opportunityNode.label,

                        action: actionNode.label,

                        score: pathwayScore,

                        trajectoryType,

                        convergenceFactor,

                        leverageMultiplier:
                            Number(
                                leverageMultiplier.toFixed(2)
                            )

                    });

                });

            });

        });

    });

    // REMOVE DUPLICATE TRAJECTORIES
    const deduped = [];

    const seen = new Set();

    pathways.forEach(path => {

        const signature =
            [
                path.signal,
                path.insight,
                path.opportunity,
                path.action
            ].join("|");

        if (!seen.has(signature)) {

            seen.add(signature);

            deduped.push(path);

        }

    });

    return deduped
        .sort((a, b) => b.score - a.score)
        .slice(0, 12);
}

        const strategicPaths = buildStrategicPaths(
    Array.from(nodeMap.values()),
    links
);

    // ======================================================
// SEMANTIC GRAVITY ENGINE
// ======================================================

function calculateSemanticGravity(node, links) {

    const connected = links.filter(link => {

        const sourceId =
            typeof link.source === "object"
                ? link.source.id
                : link.source;

        const targetId =
            typeof link.target === "object"
                ? link.target.id
                : link.target;

        return (
            sourceId === node.id ||
            targetId === node.id
        );
    });

    let gravity = 0;

    connected.forEach(link => {

        gravity += (
            (link.strength || 0.3) * 18
        );

    });

    gravity += (
        (node.weight || 0.5) * 40
    );

    if (node.type === "opportunity") {
        gravity += 22;
    }

    if (node.type === "insight") {
        gravity += 12;
    }

    return Math.round(
        Math.min(gravity, 100)
    );
}


function detectHiddenClusters(nodes, links) {

    const clusters = [];

    const visited = new Set();

    nodes.forEach(node => {

        if (visited.has(node.id)) return;

        const connectedLinks = links.filter(link => {

            const sourceId =
                typeof link.source === "object"
                    ? link.source.id
                    : link.source;

            const targetId =
                typeof link.target === "object"
                    ? link.target.id
                    : link.target;

            return (
                sourceId === node.id ||
                targetId === node.id
            );
        });

        const clusterNodes = new Set();

        connectedLinks.forEach(link => {

            const sourceId =
                typeof link.source === "object"
                    ? link.source.id
                    : link.source;

            const targetId =
                typeof link.target === "object"
                    ? link.target.id
                    : link.target;

            clusterNodes.add(sourceId);
            clusterNodes.add(targetId);
        });

        if (clusterNodes.size >= 3) {

            const clusterArray =
                Array.from(clusterNodes);

            clusterArray.forEach(id =>
                visited.add(id)
            );

            clusters.push({
                id: `cluster_${clusters.length}`,
                members: clusterArray,
                density:
                    connectedLinks.length /
                    clusterArray.length
            });
        }
    });

    return clusters;
}


function propagateTrajectoryStrength(paths) {

    return paths.map(path => {

        let momentum = path.score;

        if (
            path.opportunity
                .toLowerCase()
                .includes("automation")
        ) {
            momentum += 12;
        }

        if (
            path.action
                .toLowerCase()
                .includes("scale")
        ) {
            momentum += 8;
        }

        return {
            ...path,
            momentum:
                Math.min(
                    Math.round(momentum),
                    100
                )
        };

    });

}


Array.from(nodeMap.values()).forEach(node => {

    node.gravity =
        calculateSemanticGravity(
            node,
            links
        );

});

const hiddenClusters =
    detectHiddenClusters(
        Array.from(nodeMap.values()),
        links
    );

const propagatedPaths =
    propagateTrajectoryStrength(
        strategicPaths
    );
        
        // STRATEGIC INTELLIGENCE SCORING
Array.from(nodeMap.values()).forEach(node => {

    node.strategicScore = calculateStrategicScore(node, links);

    if (node.strategicScore >= 90) {

    node.rank = "Core";

}
else if (node.strategicScore >= 78) {

    node.rank = "Dominant";

}
else if (node.strategicScore >= 64) {

    node.rank = "Strategic";

}
else if (node.strategicScore >= 48) {

    node.rank = "Relevant";

}
else {

    node.rank = "Peripheral";

}

});

        return withCors({
    statusCode: 200,
    body: JSON.stringify({
        nodes: Array.from(nodeMap.values()),
        links,
        strategicPaths
    })
});

    } catch (error) {

        console.error(
    "BUILD NEXUS GRAPH ERROR:",
    error,
    error.stack
);

        return withCors({
    statusCode: 500,
    body: JSON.stringify({
        error: "Failed to construct Nexus graph."
    })
});

    }

};
