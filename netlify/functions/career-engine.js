const requestLog = new Map();
const RATE_LIMIT = 10;
const WINDOW_MS = 60 * 1000;

function analyzeTraits(hobbies, skills, talents) {
    const text = `${hobbies} ${skills} ${talents}`.toLowerCase();
    
    const dictionary = {
        analytical: ['analyz', 'data', 'research', 'problem', 'logic', 'math', 'stats', 'query', 'investigat', 'audit'],
        creative: ['design', 'art', 'write', 'music', 'content', 'creative', 'video', 'brand', 'sketch', 'illustrat'],
        interpersonal: ['talk', 'help', 'teach', 'communicat', 'sales', 'lead', 'mentor', 'social', 'team', 'coach'],
        technical: ['code', 'tech', 'software', 'engineer', 'develop', 'api', 'cloud', 'system', 'network', 'security'],
        physical: ['build', 'hands', 'outdoor', 'fitness', 'labor', 'repair', 'craft', 'move', 'sport', 'mechanic']
    };

    const signals = {};
    Object.keys(dictionary).forEach(trait => {
        const matches = dictionary[trait].filter(word => text.includes(word));
        const raw = matches.length;
        signals[trait] = raw === 0 ? 0 : +(1 - Math.exp(-raw / 2)).toFixed(3);
    });
    return signals;
}

/**
 * LAYER 2: DETAILED PROFILE SCORING
 */
function scoreProfile(signals) {
    const breakdown = {
        analytical: signals.analytical > 0 ? 20 : 0,
        creative: signals.creative > 0 ? 20 : 0,
        interpersonal: signals.interpersonal > 0 ? 20 : 0,
        technical: signals.technical > 0 ? 20 : 0,
        physical: signals.physical > 0 ? 20 : 0
    };

    const score = Object.values(breakdown).reduce((a, b) => a + b, 0);

    return {
        score,
        breakdown,
        activeTraits: Object.keys(breakdown).filter(k => breakdown[k] > 0)
    };
}

/**
 * LAYER 3: SCORING AUTHORITY MODEL
 */
function enhanceCareers(careers, signals, baseScore) {
    const traitMap = {
        technical: ['engineer', 'developer', 'software', 'tech', 'data', 'architect', 'system'],
        creative: ['designer', 'writer', 'artist', 'creative', 'content', 'producer', 'creative'],
        interpersonal: ['manager', 'lead', 'coach', 'sales', 'director', 'representative'],
        analytical: ['analyst', 'researcher', 'scientist', 'strategist', 'consultant'],
        physical: ['mechanic', 'trainer', 'specialist', 'technician', 'builder']
    };

    return careers.map(career => {
        let adjustedScore = Number(career.alignmentScore) || baseScore;
        const title = (career.careerTitle || "").toLowerCase();

        Object.keys(traitMap).forEach(trait => {
            if (traitMap[trait].some(kw => title.includes(kw))) {
                adjustedScore += (signals[trait] * 8); 
            }
        });

        return {
            ...career,
            alignmentScore: Math.min(Math.round(adjustedScore), 100)
        };
    });
}

/**
 * SECURITY & RELIABILITY UTILITIES
 */
function isRateLimited(ip) {
    const now = Date.now();
    if (requestLog.size > 2000) {
        const cutoff = Date.now() - WINDOW_MS;
        for (const [ipKey, timestamps] of requestLog.entries()) {
            const filtered = timestamps.filter(ts => ts > cutoff);
            if (filtered.length === 0) requestLog.delete(ipKey);
            else requestLog.set(ipKey, filtered);
        }
    }
    if (!requestLog.has(ip)) {
        requestLog.set(ip, []);
    }

    const timestamps = requestLog.get(ip).filter(ts => now - ts < WINDOW_MS);
    timestamps.push(now);
    requestLog.set(ip, timestamps);

    return timestamps.length > RATE_LIMIT;
}

const sanitize = (str) =>
    (str || "")
        .replace(/[`<>]/g, '')
        .trim()
        .slice(0, 1000);

exports.handler = async (event, context) => {
    const headers = {
        "Access-Control-Allow-Origin": "https://www.ryguylabs.com",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json"
    };

    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 200, headers, body: "OK" };
    }

    const ip = event.headers["x-nf-client-connection-ip"] || 
               event.headers["x-forwarded-for"] || 
               "unknown";

    if (isRateLimited(ip)) {
        return {
            statusCode: 429,
            headers,
            body: JSON.stringify({
                error: "Rate Limit Exceeded",
                message: "Too many requests. Please wait a moment."
            })
        };
    }

    try {
        const rawData = JSON.parse(event.body || "{}");

        let hobbies = sanitize(rawData.hobbies);
        let skills = sanitize(rawData.skills);
        let talents = sanitize(rawData.talents);
        let country = sanitize(rawData.country);

        const traitSignals = analyzeTraits(hobbies, skills, talents);
        const scorePackage = scoreProfile(traitSignals);
        const baseScore = scorePackage.score;

        const scoreOwnership = {
            baseScore,
            breakdown: scorePackage.breakdown,
            activeTraits: scorePackage.activeTraits,
            traitSignals,
            inputFingerprint: Buffer.from(`${hobbies}|${skills}|${talents}|${country}`).toString("base64"),
            timestamp: Date.now(),
            ip
        };

        const apiKey = process.env.FIRST_API_KEY;
        if (!apiKey) throw new Error("API Key missing.");

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

        const apiPayload = {
            contents: [{
                parts: [{
                    text: `SYSTEM: You are the RyGuyLabs Career Alignment Engine.
MISSION: Transform user traits into 3–5 high-performance career paths.
USER DATA: Hobbies: ${hobbies}, Skills: ${skills}, Talents: ${talents}, Location: ${country}
PRE-ANALYSIS: Traits: ${JSON.stringify(traitSignals)}, Base Score: ${baseScore}/100.
RULES: Return valid JSON only. Follow schema strictly. No commentary.`
                }]
            }],
            generationConfig: {
                temperature: 0.2,
                response_mime_type: "application/json"
            }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(apiPayload)
        });

        const result = await response.json();

        if (!response.ok) {
            console.error("GEMINI ERROR:", result);
            throw new Error(result.error?.message || "Google API Failure");
        }

        let rawContent = result?.candidates?.[0]?.content?.parts?.[0]?.text || result?.candidates?.[0]?.output || "";

        if (!rawContent) {
            console.error("EMPTY RESPONSE FROM MODEL:", JSON.stringify(result));
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    careers: [{
                        careerTitle: "Career Analysis Unavailable",
                        alignmentScore: 0,
                        earningPotential: "Unknown",
                        reasoning: "System fallback activated due to AI response failure.",
                        searchKeywords: [],
                        attainmentPlan: ["Retry request"]
                    }],
                    scoreOwnership
                })
            };
        }

        let finalData;
        try {
            finalData = JSON.parse(rawContent);
        } catch (e) {
            console.error("PRIMARY JSON PARSE FAILED, ATTEMPTING RECOVERY:", rawContent);
            const match = rawContent.match(/\{[\s\S]*\}/);
            if (!match) {
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        careers: [{
                            careerTitle: "Critical Parse Failure",
                            alignmentScore: 0,
                            earningPotential: "Unknown",
                            reasoning: "AI output could not be recovered.",
                            searchKeywords: [],
                            attainmentPlan: ["Retry generation"]
                        }],
                        scoreOwnership
                    })
                };
            }
            finalData = JSON.parse(match[0]);
        }

        let sanitizedCareers = (finalData?.careers || []).map(c => ({
            careerTitle: c.careerTitle || "Unknown Role",
            alignmentScore: Number(c.alignmentScore) || 0,
            earningPotential: c.earningPotential || "Variable",
            reasoning: c.reasoning || "",
            searchKeywords: Array.isArray(c.searchKeywords) ? c.searchKeywords : [],
            attainmentPlan: Array.isArray(c.attainmentPlan) ? c.attainmentPlan : []
        }));

        const enhancedCareers = enhanceCareers(sanitizedCareers, traitSignals, baseScore);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                careers: enhancedCareers.sort((a, b) => b.alignmentScore - a.alignmentScore),
                scoreOwnership
            })
        };

    } catch (error) {
        console.error("Internal Failure:", error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "Processing Error", message: error.message })
        };
    }
};
