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

   if (matchCount === 1) boost = 1;
if (matchCount === 2) boost = 3;
if (matchCount >= 3) boost = 5;

    return boost;
}

function generateEarnings(score, title, country) {

    const t = (title || "").toLowerCase();
    const loc = (country || "").toLowerCase();

    // 1. Career-based baseline
    let base;

    if (/(engineer|developer|software)/.test(t)) base = 85000;
    else if (/(data|analyst|research)/.test(t)) base = 70000;
    else if (/(sales|manager|consult)/.test(t)) base = 65000;
    else if (/(design|creative|writer|content)/.test(t)) base = 50000;
    else if (/(mechanic|construction|labor)/.test(t)) base = 45000;
    else base = 55000;

    // 2. REGION MULTIPLIER (simple but effective)
    let regionMultiplier = 1;

    if (/united states|usa|california|new york/.test(loc)) regionMultiplier = 1.25;
    else if (/canada|uk|australia/.test(loc)) regionMultiplier = 1.15;
    else if (/europe/.test(loc)) regionMultiplier = 1.05;
    else if (/india|philippines|africa/.test(loc)) regionMultiplier = 0.7;

    base = base * regionMultiplier;

    // 3. Score influence (light)
    const modifier = 1 + (score - 70) / 200;

    const entry = Math.round(base * 0.8 * modifier);
    const mid = Math.round(base * 1.2 * modifier);
    const ceiling = Math.round(base * 1.8 * modifier);

    return {
        earningEntry: `$${entry.toLocaleString()}`,
        earningMid: `$${mid.toLocaleString()}`,
        earningCeiling: `$${ceiling.toLocaleString()}`,
        earningPotential: `$${mid.toLocaleString()} avg`
    };
}
function calculateCareerOverlapPenalty(career, allCareers) {
    const title = career.careerTitle.toLowerCase();

    const categories = {
        tech: /(engineer|developer|software|data|it)/,
        creative: /(design|artist|writer|content)/,
        business: /(sales|manager|marketing|consult)/,
        physical: /(mechanic|construction|fitness|labor)/,
        education: /(teacher|coach|trainer|instructor)/
    };

    let overlaps = 0;

    for (const other of allCareers) {
        if (other.careerTitle === career.careerTitle) continue;

        const otherTitle = other.careerTitle.toLowerCase();

        for (const key in categories) {
            if (categories[key].test(title) && categories[key].test(otherTitle)) {
                overlaps++;
            }
        }
    }

    // small penalty per overlap (keeps system stable)
    return Math.min(overlaps * 2, 6);
}

function buildCareerExplanation(career, signals) {
    const reasons = [];

    const title = career.careerTitle.toLowerCase();

    if (signals.technical && /(engineer|developer|software|tech)/.test(title)) {
    reasons.push("Your responses show a clear pattern toward technical thinking—this path allows you to solve complex problems, build systems, and create scalable solutions that are highly valued in today’s market.");
}

if (signals.creative && /(design|writer|artist|content)/.test(title)) {
    reasons.push("You demonstrate strong creative instincts, and this career gives you a direct outlet to turn ideas into tangible work—whether through design, storytelling, or content creation that captures attention.");
}

if (signals.analytical && /(analyst|data|research)/.test(title)) {
    reasons.push("You naturally lean toward analysis and structured thinking, making this path a strong fit for breaking down problems, identifying patterns, and making high-impact decisions based on data.");
}

if (signals.interpersonal && /(sales|manager|coach|teacher)/.test(title)) {
    reasons.push("Your profile reflects strong interpersonal ability—this role allows you to influence, guide, and connect with others, which is a major driver of both career growth and income potential.");
}

if (signals.physical && /(mechanic|construction|fitness|labor)/.test(title)) {
    reasons.push("You show a preference for hands-on, action-oriented work, and this career aligns with building, moving, or working physically—often leading to faster entry points and practical, in-demand skills.");
}

if (reasons.length > 1) {
    reasons.push("What makes this path especially strong for you is the combination of these traits working together—this is where people tend to outperform others and progress faster.");
}    
    return reasons.length ? reasons.join(". ") : "General alignment based on profile match";
}

function calculateExecutionFriction(career, signals) {
    const title = career.careerTitle.toLowerCase();
    let penalty = 0;

    if (/(doctor|lawyer|engineer|scientist)/.test(title)) {
        penalty += 8;
    }

    if (/(analyst|developer|manager|consult)/.test(title)) {
        penalty += 4;
    }

    if (!signals.technical && /(engineer|developer|software)/.test(title)) {
        penalty += 6;
    }

    return penalty;
}

function enhanceCareers(careers, signals, baseScore) {
    return careers.map(career => {
       let adjustedScore = Number(career.alignmentScore);

if (isNaN(adjustedScore) || adjustedScore === 0) {
    adjustedScore = baseScore;
}

        let attribution = {
    base: Number(career.alignmentScore) || baseScore,
    fitBoost: 0,
    friction: 0,
    overlap: 0,
    manual: 0
};

        // overlap penalty
        const overlap = calculateCareerOverlapPenalty(career, careers);
        adjustedScore -= overlap;
        attribution.overlap = overlap;

        // fit boost (correct object usage)
        const fitBoost = calculateFitBoost(career, {
    technical: signals.technical > 0,
    creative: signals.creative > 0,
    analytical: signals.analytical > 0,
    interpersonal: signals.interpersonal > 0,
    physical: signals.physical > 0
});

adjustedScore += fitBoost;
attribution.fitBoost = fitBoost;

        // friction penalty (separate step — CORRECT placement)
        const friction = calculateExecutionFriction(career, signals);
        adjustedScore -= friction;
        attribution.friction = friction;

        // legacy boosts (still fine, optional)
        let manual = 0;

        if (signals.technical && career.careerTitle.toLowerCase().includes('engineer')) {
        manual += 5;
        }

        if (signals.creative && career.careerTitle.toLowerCase().includes('design')) {
        manual += 5;
        }

        adjustedScore += manual;
        attribution.manual = manual;
        // position-based variance (creates intentional spread)
const index = careers.findIndex(c => c.careerTitle === career.careerTitle);

const rankMultiplier = (() => {
    if (index === 0) return 6;
    if (index === 1) return 3;
    if (index === 2) return 0;
    if (index === 3) return -2;
    return -4;
})();

adjustedScore += rankMultiplier;
attribution.rankMultiplier = rankMultiplier;
// FINAL SCORE MUST BE CREATED HERE
const finalScore = Math.max(10, Math.min(Math.round(adjustedScore), 100));
const scoreBands = [
    [92, 100], // rank 0
    [84, 91],  // rank 1
    [76, 83],  // rank 2
    [68, 75],  // rank 3
    [60, 67]   // rank 4
];

const band = scoreBands[index] || [50, 60];

const clampedFinalScore = Math.max(
    band[0],
    Math.min(finalScore, band[1])
);
        
const earnings = generateEarnings(
    finalScore,
    career.careerTitle,
    signals.country || ""
);

// apply score-based variance multiplier
const varianceFactor = 0.85 + (finalScore / 200); 
// range ~0.85 to 1.35

function adjust(value) {
    const num = parseFloat(value.replace(/[$,]/g, ""));
    return Math.round(num * varianceFactor).toLocaleString();
}

return {
    ...career,
    alignmentScore: clampedFinalScore,
    signals,
    attribution: {
        ...attribution,
        rankMultiplier,
        finalScore
    },
    earningEntry: `$${adjust(earnings.earningEntry)}`,
    earningMid: `$${adjust(earnings.earningMid)}`,
    earningCeiling: `$${adjust(earnings.earningCeiling)}`,
    earningPotential: earnings.earningPotential
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

    if (!ip || ip === "unknown") return false;

    if (!requestLog.has(ip)) {
        requestLog.set(ip, []);
    }

    const timestamps = requestLog.get(ip);

    // remove expired timestamps
    const filtered = timestamps.filter(ts => now - ts < WINDOW_MS);

    filtered.push(now);

    requestLog.set(ip, filtered);

    return filtered.length > RATE_LIMIT;
}

exports.handler = async (event) => {
    // 1. Define headers at the very top so they are available to all return statements
    const headers = {
        "Access-Control-Allow-Origin": "https://www.ryguylabs.com",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, x-nf-client-connection-ip",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json"
    };

    // 2. Handle OPTIONS immediately
    // Don't check for origin presence here; just return the headers the browser is asking for.
    if (event.httpMethod === "OPTIONS") {
        return {
            statusCode: 204, 
            headers,
            body: ""
        };
    }

    try {
        // 3. Extract IP safely
        const ip =
            event.headers["x-nf-client-connection-ip"] ||
            event.headers["x-forwarded-for"] ||
            event.headers["client-ip"] ||
            "unknown";

        // 4. Rate Limiting Check
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

        const rawData = JSON.parse(event.body || "{}");

        let hobbies = (rawData.hobbies || "").trim();
        let skills = (rawData.skills || "").trim();
        let talents = (rawData.talents || "").trim();
        let country = (rawData.country || "").trim();

        const traitSignals = analyzeTraits(hobbies, skills, talents);
        const scorePackage = scoreProfile(traitSignals);
        const baseScore = scorePackage.score;

        const scoreOwnership = {
            baseScore,
            breakdown: scorePackage.breakdown,
            activeTraits: scorePackage.activeTraits,
            traitSignals,
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

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;

        const apiPayload = {
            contents: [{
                parts: [{
                    text: `SYSTEM: You are the RyGuyLabs Career Ranking Intelligence Engine.

CORE MISSION:
You are NOT generating suggestions.
You are performing forced ranking classification of human potential into a structured career hierarchy.

You must output 3–5 careers ranked by TRUE differentiation strength.

---

CRITICAL BEHAVIOR MODEL:
- Each career is a COMPETING OPTION, not an equal suggestion
- You are assigning ORDER OF FIT, not listing possibilities
- You must maximize variance between rankings
- You must behave like a scoring algorithm, not a chatbot

---

USER DATA:
Hobbies: ${hobbies}
Skills: ${skills}
Talents: ${talents}
Location: ${country}

Trait Signals:
${JSON.stringify(traitSignals)}

Base Profile Score:
${baseScore}/100

Score Breakdown:
${JSON.stringify(scorePackage.breakdown)}

Active Traits:
${scorePackage.activeTraits.join(", ")}

---

HARD RANKING SYSTEM (MANDATORY):

You MUST generate 3–5 careers with STRICT score separation:

- #1 career: 88–96 range (dominant fit)
- #2 career: 78–87 range (strong alternative)
- #3 career: 68–77 range (viable fallback)
- #4 career: 58–67 range (optional stretch)
- #5 career: 45–57 range (weakest acceptable fit)

Rules:
- No duplicate alignmentScore values allowed
- Minimum 7-point gap between adjacent ranks
- #1 MUST be clearly superior in reasoning depth
- #5 MUST still be valid but clearly weakest alignment

---

DIVERSITY CONSTRAINTS:
- No two careers may belong to the same industry cluster
- Must span at least 3 different domains when possible:
  (Tech, Creative, Business, Physical, Analytical, Education, Healthcare, Operations)

---

DECISION LOGIC:
You must simulate:
1. Trait dominance weighting
2. Career competition scoring
3. Long-term earning potential
4. Skill transfer difficulty
5. Execution friction

Then rank based on combined score.

---

OUTPUT FORMAT (STRICT JSON ONLY):

{
  "careers": [
    {
      "careerTitle": "",
      "alignmentScore": number,
      "earningPotential": "",
      "reasoning": "",
      "searchKeywords": [],
      "attainmentPlan": [
        "Step 1 (must be actionable within 48 hours)",
        "Step 2",
        "Step 3",
        "Step 4"
      ]
    }
  ]
}

---

QUALITY ENFORCEMENT:
- Reasoning must justify WHY this rank position exists
- Do NOT reuse similar phrasing across careers
- Each career must feel like a different “strategy path”
- Step plans must differ per career (no templates)

---

FINAL RULE:
Return ONLY valid JSON. No commentary. No markdown. No exceptions.`
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
    attainmentPlan: Array.isArray(c.attainmentPlan) ? c.attainmentPlan : [],
    explanation: buildCareerExplanation(c, traitSignals)
}));

finalData.careers = enhanceCareers(
    sanitizedCareers,
    { ...traitSignals, country },
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
