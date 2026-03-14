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
                    PRIME DIRECTIVE: Help users overcome social anxiety and fear to achieve high-performance dreams. 
                    SCHEDULE RULES: Prioritize meaningful progress while maintaining balance and healthy routines.
                    USER DATA:
                    Hobbies: ${hobbies}
                    Skills: ${skills}
                    Talents: ${talents}
                    Location: ${country}

                    TASK:
                    Align these traits to a high-performance career. Return a JSON object ONLY.

                    FORMAT:
                    {
                        "careerTitle": "string",
                        "alignmentScore": number,
                        "earningPotential": "string",
                        "attainmentPlan": ["step 1", "step 2", "step 3", "step 4"],
                        "reasoning": "string",
                        "searchKeywords": ["keyword1", "keyword2"]
                    }` 
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

