const requestLog = new Map();
const RATE_LIMIT = 10;
const WINDOW_MS = 60 * 1000;

/**
 * LAYER 1: TRAIT ANALYSIS
 * Uses regex to identify core personality and skill signals from raw text.
 */
function analyzeTraits(hobbies, skills, talents) {
    const text = (hobbies + " " + skills + " " + talents).toLowerCase();

    return {
        analytical: /(analyz|data|research|problem|logic|math)/.test(text),
        creative: /(design|art|write|music|content|creative)/.test(text),
        interpersonal: /(talk|help|teach|communicat|sales|lead)/.test(text),
        technical: /(code|tech|software|engineer|develop)/.test(text),
        physical: /(build|hands|outdoor|fitness|labor)/.test(text)
    };
}

/**
 * LAYER 2: PROFILE SCORING
 * Generates a base alignment score and breakdown based on detected signals.
 */
function scoreProfile(signals) {
    const breakdown = {
        analytical: signals.analytical ? 20 : 0,
        creative: signals.creative ? 20 : 0,
        interpersonal: signals.interpersonal ? 20 : 0,
        technical: signals.technical ? 20 : 0,
        physical: signals.physical ? 20 : 0
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
 * Refines the AI-generated scores using deterministic logic to ensure accuracy.
 */
function enhanceCareers(careers, signals, baseScore) {
    return careers.map(career => {
        // Ensure the alignment score is a number and doesn't exceed 100
        let adjustedScore = Number(career.alignmentScore) || baseScore;
        
        // Simple logic to boost scores if they align with strong technical or creative signals
        if (signals.technical && career.careerTitle.toLowerCase().includes('engineer')) adjustedScore += 5;
        if (signals.creative && career.careerTitle.toLowerCase().includes('design')) adjustedScore += 5;
        
        return {
            ...career,
            alignmentScore: Math.min(Math.round(adjustedScore), 100)
        };
    });
}

/**
 * SECURITY: RATE LIMITING
 */
function isRateLimited(ip) {
    const now = Date.now();

    if (!requestLog.has(ip)) {
        requestLog.set(ip, []);
    }

    const timestamps = requestLog.get(ip).filter(ts => now - ts < WINDOW_MS);
    timestamps.push(now);
    requestLog.set(ip, timestamps);

    // Memory management: clean up old IPs if the log grows too large
    if (requestLog.size > 1000) {
        for (let [key, val] of requestLog.entries()) {
            if (val.length === 0 || (now - val[val.length - 1] > WINDOW_MS)) {
                requestLog.delete(key);
            }
        }
    }

    return timestamps.length > RATE_LIMIT;
}

/**
 * MAIN HANDLER
 */
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
               event.headers["client-ip"] ||
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

        const hobbies = (rawData.hobbies || "").trim();
        const skills = (rawData.skills || "").trim();
        const talents = (rawData.talents || "").trim();
        const country = (rawData.country || "").trim();

        // Input size limit protection
        const MAX_INPUT_LENGTH = 2000;
        if ((hobbies + skills + talents).length > MAX_INPUT_LENGTH) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                    error: "Input too large",
                    message: `Combined input length exceeds ${MAX_INPUT_LENGTH} characters.`
                })
            };
        }

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
        if (!apiKey) {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: "Config Error", message: "API Key missing." })
            };
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview-09-2025:generateContent?key=${apiKey}`;

        const apiPayload = {
            contents: [{
                parts: [{
                    text: `SYSTEM: You are the RyGuyLabs Career Alignment Engine.
MISSION: Transform a user's traits into 3–5 high-performance, real-world career paths.
USER DATA: Hobbies: ${hobbies}, Skills: ${skills}, Talents: ${talents}, Location: ${country}
PRE-ANALYSIS: Traits: ${JSON.stringify(traitSignals)}, Base Score: ${baseScore}/100.
RULES: Return valid JSON only. Follow schema strictly. Step 1 must be executable in 24-48 hours.`
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
            throw new Error(result.error?.message || "Google API Failure");
        }

        const rawContent = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
        if (!rawContent) throw new Error("AI returned empty response");

        let finalData;
        try {
            finalData = JSON.parse(rawContent);
        } catch (e) {
            const match = rawContent.match(/\{[\s\S]*\}/);
            if (!match) throw new Error("Invalid AI Response Format");
            finalData = JSON.parse(match[0]);
        }

        const sanitizedCareers = (finalData.careers || []).map(c => ({
            careerTitle: c.careerTitle || "Unknown Role",
            alignmentScore: Number(c.alignmentScore) || 0,
            earningPotential: c.earningPotential || "Variable",
            reasoning: c.reasoning || "",
            searchKeywords: Array.isArray(c.searchKeywords) ? c.searchKeywords : [],
            attainmentPlan: Array.isArray(c.attainmentPlan) ? c.attainmentPlan : []
        }));

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                careers: enhanceCareers(sanitizedCareers, traitSignals, baseScore),
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
