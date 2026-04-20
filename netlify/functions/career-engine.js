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
    for (const trait in dictionary) {
        const matches = dictionary[trait].filter(w => text.includes(w));
        const raw = matches.length;
        signals[trait] = raw === 0 ? 0 : +(1 - Math.exp(-raw / 2)).toFixed(3);
    }
    return signals;
}

function scoreProfile(signals) {
    const breakdown = {
        analytical: signals.analytical > 0 ? 20 : 0,
        creative: signals.creative > 0 ? 20 : 0,
        interpersonal: signals.interpersonal > 0 ? 20 : 0,
        technical: signals.technical > 0 ? 20 : 0,
        physical: signals.physical > 0 ? 20 : 0
    };

    return {
        score: Object.values(breakdown).reduce((a, b) => a + b, 0),
        breakdown,
        activeTraits: Object.keys(breakdown).filter(k => breakdown[k] > 0)
    };
}

function enhanceCareers(careers, signals, baseScore) {
    const traitMap = {
        technical: ['engineer', 'developer', 'software', 'tech', 'data', 'architect', 'system'],
        creative: ['designer', 'writer', 'artist', 'content', 'producer'],
        interpersonal: ['manager', 'lead', 'coach', 'sales', 'director'],
        analytical: ['analyst', 'researcher', 'scientist', 'consultant'],
        physical: ['mechanic', 'trainer', 'technician', 'builder']
    };

    return careers.map(career => {
        let adjustedScore = Number(career.alignmentScore) || baseScore;
        const title = (career.careerTitle || "").toLowerCase();

        for (const trait in traitMap) {
            if (traitMap[trait].some(k => title.includes(k))) {
                adjustedScore += (signals[trait] || 0) * 8;
            }
        }

        return {
            ...career,
            alignmentScore: Math.min(Math.round(adjustedScore), 100)
        };
    });
}

function isRateLimited(ip) {
    const now = Date.now();

    if (requestLog.size > 2000) {
        const cutoff = now - WINDOW_MS;
        for (const [ipKey, times] of requestLog.entries()) {
            const filtered = times.filter(t => t > cutoff);
            filtered.length ? requestLog.set(ipKey, filtered) : requestLog.delete(ipKey);
        }
    }

    const times = requestLog.get(ip) || [];
    const recent = times.filter(t => now - t < WINDOW_MS);

    recent.push(now);
    requestLog.set(ip, recent);

    return recent.length > RATE_LIMIT;
}

const sanitize = (str) =>
    (str || "").replace(/[`<>]/g, '').trim().slice(0, 1000);

exports.handler = async (event) => {
    const headers = {
        "Access-Control-Allow-Origin": "https://www.ryguylabs.com",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json"
    };

    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 200, headers, body: "OK" };
    }

    try {
        const ip =
            event.headers["x-nf-client-connection-ip"] ||
            event.headers["x-forwarded-for"] ||
            "unknown";

        if (isRateLimited(ip)) {
            return {
                statusCode: 429,
                headers,
                body: JSON.stringify({ error: "Rate Limit Exceeded" })
            };
        }

        const rawData = JSON.parse(event.body || "{}");

        const hobbies = sanitize(rawData.hobbies);
        const skills = sanitize(rawData.skills);
        const talents = sanitize(rawData.talents);
        const country = sanitize(rawData.country);

        const traitSignals = analyzeTraits(hobbies, skills, talents);
        const scorePackage = scoreProfile(traitSignals);
        const baseScore = scorePackage.score;

        const apiKey = process.env.FIRST_API_KEY;
        if (!apiKey) throw new Error("Missing API key");

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: `Return JSON only. Careers based on: ${hobbies}, ${skills}, ${talents}, ${country}. Score: ${baseScore}`
                    }]
                }],
                generationConfig: {
                    temperature: 0.2,
                    response_mime_type: "application/json"
                }
            })
        });

        const result = await response.json();

        let rawContent =
            result?.candidates?.[0]?.content?.parts?.[0]?.text || "";

        if (!rawContent) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ careers: [], scorePackage })
            };
        }

        let finalData;

        try {
            finalData = JSON.parse(rawContent);
        } catch {
            const match = rawContent.match(/\{[\s\S]*\}/);
            if (!match) throw new Error("Unparseable AI output");
            finalData = JSON.parse(match[0]);
        }

        const careers = enhanceCareers(
            (finalData?.careers || []),
            traitSignals,
            baseScore
        );

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                careers: careers.sort((a, b) => b.alignmentScore - a.alignmentScore),
                scorePackage
            })
        };

    } catch (error) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: "Processing Error",
                message: error.message
            })
        };
    }
};
