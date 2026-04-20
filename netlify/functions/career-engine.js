const requestLog = new Map();
function detectTraitConflicts(signals) {
    const conflicts = [];

    if (signals.analytical && signals.creative) {
        conflicts.push("analytical_creative");
    }

    if (signals.technical && signals.interpersonal) {
        conflicts.push("technical_interpersonal");
    }

    if (signals.physical && signals.analytical) {
        conflicts.push("physical_analytical");
    }

    return conflicts;
}

function calculateFitBoost(career, signals) {
    const title = career.careerTitle.toLowerCase();
    let boost = 0;

    const matchesTechnical = signals.technical && /(engineer|developer|software|tech)/.test(title);
    const matchesCreative = signals.creative && /(design|writer|artist|content)/.test(title);
    const matchesAnalytical = signals.analytical && /(analyst|data|research)/.test(title);
    const matchesInterpersonal = signals.interpersonal && /(sales|manager|coach|teacher)/.test(title);
    const matchesPhysical = signals.physical && /(mechanic|construction|fitness|labor)/.test(title);

    const matchCount = [
        matchesTechnical,
        matchesCreative,
        matchesAnalytical,
        matchesInterpersonal,
        matchesPhysical
    ].filter(Boolean).length;

    // exponential-style reinforcement (not linear)
    if (matchCount === 1) boost = 2;
    if (matchCount === 2) boost = 5;
    if (matchCount >= 3) boost = 10;

    return boost;
}

function enhanceCareers(careers, signals, baseScore) {
    return careers.map(career => {
        // Ensure the alignment score is a number and doesn't exceed 100
        let adjustedScore = Number(career.alignmentScore) || baseScore;
        adjustedScore += calculateFitBoost(career, signals);
        // Simple logic to boost scores if they align with strong technical or creative signals
        if (signals.technical && career.careerTitle.toLowerCase().includes('engineer')) adjustedScore += 5;
        if (signals.creative && career.careerTitle.toLowerCase().includes('design')) adjustedScore += 5;
       
        return {
            ...career,
            alignmentScore: Math.min(adjustedScore, 100)
        };
    });
}

function analyzeTraits(hobbies, skills, talents) {
    const text = (hobbies + " " + skills + " " + talents).toLowerCase();

    const countMatches = (regex) => (text.match(regex) || []).length;

    return {
        analytical: Math.min(countMatches(/(analyz|data|research|problem|logic|math)/g), 3),
        creative: Math.min(countMatches(/(design|art|write|music|content|creative)/g), 3),
        interpersonal: Math.min(countMatches(/(talk|help|teach|communicat|sales|lead)/g), 3),
        technical: Math.min(countMatches(/(code|tech|software|engineer|develop)/g), 3),
        physical: Math.min(countMatches(/(build|hands|outdoor|fitness|labor)/g), 3)
    };
}
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

const RATE_LIMIT = 10;
const WINDOW_MS = 60 * 1000;

function isRateLimited(ip) {
    const now = Date.now();

    if (!requestLog.has(ip)) {
        requestLog.set(ip, []);
    }

    const timestamps = requestLog.get(ip).filter(ts => now - ts < WINDOW_MS);

    timestamps.push(now);
    requestLog.set(ip, timestamps);

    return timestamps.length > RATE_LIMIT;
}

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

    const ip =
event.headers["x-nf-client-connection-ip"] ||
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

let hobbies = (rawData.hobbies || "").trim();
let skills = (rawData.skills || "").trim();
let talents = (rawData.talents || "").trim();
let country = (rawData.country || "").trim();
const traitSignals = analyzeTraits(hobbies, skills, talents);
const traitConflicts = detectTraitConflicts(traitSignals);
const scorePackage = scoreProfile(traitSignals);
const baseScore = scorePackage.score;
const scoreOwnership = {
    baseScore,
    breakdown: scorePackage.breakdown,
    activeTraits: scorePackage.activeTraits,
    traitSignals,
    traitConflicts,
    inputFingerprint: Buffer
        .from(`${hobbies}|${skills}|${talents}|${country}`)
        .toString("base64"),
    timestamp: Date.now(),
    ip
};
       
// Input size limit
const MAX_INPUT_LENGTH = 2000;
if ((hobbies + skills + talents).length > MAX_INPUT_LENGTH) {
    return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
            error: "Input too large",
            message: `Please limit your hobbies, skills, and talents to a combined ${MAX_INPUT_LENGTH} characters.`
        })
    };
}
        const apiKey = process.env.FIRST_API_KEY;

        if (!apiKey) {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: "Config Error", message: "API Key missing." })
            };
        }

        // Gemini API URL
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;

        const apiPayload = {
            contents: [{
                parts: [{
                    text: `SYSTEM: You are the RyGuyLabs Career Alignment Engine.

MISSION:
Transform a user's natural traits into 3–5 high-performance, real-world career paths that are actionable, realistic, and financially meaningful.
NON-NEGOTIABLE RULES:
- You MUST return a valid JSON object only (no markdown, no commentary).
- You MUST follow the exact schema provided.
- Be decisive. Do NOT give vague or generic career advice.
- Avoid low-income or unstable paths unless strongly justified.
- Prioritize careers with strong earning potential, scalability, or advancement.
- The user may have low confidence — your output must feel structured, clear, and motivating.

USER DATA:
Hobbies: ${hobbies}
Skills: ${skills}
Talents: ${talents}
Location: ${country}

SYSTEM PRE-ANALYSIS:
Trait Signals: ${JSON.stringify(traitSignals)}
Base Profile Score: ${baseScore}/100
Score Breakdown: ${JSON.stringify(scorePackage.breakdown)}
Active Traits: ${scorePackage.activeTraits.join(", ")}

SYSTEM RULES (HARD CONSTRAINTS):
- You MUST use the provided trait signals in your decision making
- You MUST reflect these signals in the alignmentScore
- You MUST reference at least one trait signal (analytical, creative, interpersonal, technical, physical) in the reasoning

BASE PROFILE STRENGTH SCORE:
${baseScore}/100

ANALYSIS INSTRUCTIONS:
1. Identify patterns across hobbies, skills, and talents.
2. Infer strengths (analytical, creative, interpersonal, technical, etc.).
3. Select the TOP 3 to 5 career paths that best align with long-term success.
4. Rank them from strongest to weakest alignment.
5. Each career must be distinct, realistic, and viable for someone starting from their current position.
6. Do NOT repeat similar roles — each must represent a different path.

OUTPUT REQUIREMENTS:
- You MUST return between 3 and 5 career objects inside the "careers" array.

Return EXACTLY this structure:

{
  "careers": [
    {
      "careerTitle": "Specific, real-world job title",
      "alignmentScore": number,
      "earningPotential": "Realistic earning progression",
      "reasoning": "Clear explanation referencing user traits",
      "searchKeywords": ["relevant", "job", "keywords"],
      "attainmentPlan": [
        "Step 1 (start within 24-48 hours)",
        "Step 2",
        "Step 3",
        "Step 4"
      ]
    }
  ]
}

QUALITY STANDARD:
- Steps must be specific, executable, and produce tangible outcomes (no vague advice).
- Step 1 must be achievable within 24–48 hours with no prerequisites.
- Reasoning must feel personalized, reference user inputs directly, and avoid generic language.
- Keywords must be optimized for job platforms like LinkedIn/Indeed and include actionable search intent.
- All fields must logically align (career, salary, steps, and reasoning must not contradict each other).
- Output should feel like it came from a top-tier career strategist.

FINAL RULE:
Return ONLY the JSON object. No extra text.`
                }]
            }],
           generationConfig: {
    temperature: 0.2,
    topK: 1,
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
            console.error("Gemini Error:", JSON.stringify(result));
            return {
                statusCode: response.status,
                headers,
                body: JSON.stringify({
                    error: "Upstream Error",
                    message: result.error?.message || "Google API handshake failed."
                })
            };
        }

        let rawContent = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
        if (!rawContent) {
    throw new Error("AI returned empty response");
    }
       
        let finalData;

try {
    finalData = JSON.parse(rawContent);
} catch (e) {
    const match = rawContent.match(/\{[\s\S]*\}/);
    if (!match) {
        throw new Error("Invalid AI Response Format");
    }

    finalData = JSON.parse(match[0]);
}

let sanitizedCareers = (finalData.careers || []).map(c => ({
    careerTitle: c.careerTitle || "Unknown Role",
    alignmentScore: c.alignmentScore || 0,
    earningPotential: c.earningPotential || "Variable",
    reasoning: c.reasoning || "",
    searchKeywords: Array.isArray(c.searchKeywords) ? c.searchKeywords : [],
    attainmentPlan: Array.isArray(c.attainmentPlan) ? c.attainmentPlan : []
}));

// FIXED: enhanceCareers is now defined at the top of this file
finalData.careers = enhanceCareers(
    sanitizedCareers,
    traitSignals,
    baseScore
);
        finalData.scoreOwnership = scoreOwnership;

return {
    statusCode: 200,
    headers,
    body: JSON.stringify(finalData)
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
