const requestLog = new Map();
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
  "alignmentScore": number (0-100 based on strength of fit),
  "earningPotential": "Clear earning range or description (e.g., '$60k-$120k/year' or 'High income potential')",
  "attainmentPlan": [
    "Step 1: Clear first action (immediate and practical)",
    "Step 2: Skill-building or certification path",
    "Step 3: Real-world application (job, freelance, project)",
    "Step 4: Scaling, specialization, or income growth step"
  ],
  "reasoning": "A confident, motivating explanation tying their traits directly to success in this career",
  "searchKeywords": ["5-8 highly relevant job search keywords INCLUDING the user's location when applicable (e.g., 'Software Engineer Florida', 'Remote Sales Jobs USA')"]
}

QUALITY STANDARD:
- Steps must be specific and executable (no vague advice).
- Reasoning must feel personalized and insightful, not generic.
- Keywords must be optimized for job platforms like LinkedIn/Indeed.
- Output should feel like it came from a top-tier career strategist.

FINAL RULE:
Return ONLY the JSON object. No extra text.` 
                }] 
            }],
            generationConfig: {
                temperature: 0.8,
                // response_mime_type is omitted to ensure maximum compatibility across API versions
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

