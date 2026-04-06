const requestLog = new Map();
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

function scoreProfile(signals) {
    let score = 0;
    if (signals.analytical) score += 20;
    if (signals.creative) score += 20;
    if (signals.interpersonal) score += 20;
    if (signals.technical) score += 20;
    if (signals.physical) score += 20;
    return score;
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
const baseScore = scoreProfile(traitSignals);

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

        // Switching back to v1beta with the most compatible model string
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;

        const apiPayload = {
            contents: [{ 
                parts: [{ 
                    text: `SYSTEM: You are the RyGuyLabs Career Alignment Engine.

MISSION:
Transform a user's natural traits into a clear, high-performance, real-world career path that is actionable, realistic, and financially meaningful.

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

PRE-ANALYZED TRAIT SIGNALS:
${JSON.stringify(traitSignals)}

BASE PROFILE STRENGTH SCORE:
${baseScore}/100

INSTRUCTION:
- You MUST incorporate these trait signals into your reasoning and career selection.
- Alignment score MUST reflect both the user input and these signals.
- You MUST explicitly reference at least one of these signals (analytical, creative, interpersonal, technical, physical) in the reasoning.

ANALYSIS INSTRUCTIONS:
1. Identify patterns across hobbies, skills, and talents.
2. Infer strengths (analytical, creative, interpersonal, technical, etc.).
3. Select ONE primary career that best aligns with long-term success.
4. Ensure the career is realistic for someone starting from their current position.
5. Do NOT hedge with multiple career options.

OUTPUT REQUIREMENTS:

Return EXACTLY this structure:

{
  "careerTitle": "Specific, real-world job title (not vague)",
  "alignmentScore": number (0-100 based on strength of fit, considering trait alignment, market demand, and accessibility of entry),
  "earningPotential": "Realistic earning progression including entry-level and mid-level range (e.g., '$55k-$75k entry-level, scaling to $90k-$120k with experience')",
  "attainmentPlan": [
  "Step 1: Immediate action that can be completed within 24–48 hours with no prerequisites (must result in a tangible output)",
  "Step 2: Specific skill-building or certification path with a clear outcome",
  "Step 3: Real-world application (job application, freelance work, or project with proof of work)",
  "Step 4: Scaling, specialization, or income growth step with a clear advancement outcome"
],
  "reasoning": "A confident, motivating explanation that directly references at least two of the user's inputs (hobbies, skills, or talents) and clearly explains why those traits translate to success in this career (no hedging language like 'might' or 'could')",
  "searchKeywords": ["5-8 highly relevant job search keywords INCLUDING the user's location when applicable, with at least 2 optimized for immediate application intent (e.g., 'Entry Level Software Engineer Florida', 'Hiring Remote Sales Jobs USA')"]
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
                temperature: 0.8,
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
        
        // Extract JSON block even if the AI adds markdown backticks
        const start = rawContent.indexOf('{');
        const end = rawContent.lastIndexOf('}');
        if (start === -1 || end === -1) throw new Error("Invalid AI Response Format");
        
        const jsonString = rawContent.substring(start, end + 1);
        const finalData = JSON.parse(jsonString);

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

