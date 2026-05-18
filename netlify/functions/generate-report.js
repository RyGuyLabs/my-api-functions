const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "https://www.ryguylabs.com",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
};

function safetyCheck(query) {
    const blockedTerms = ['sex', 'drugs', 'violence']; // add more as needed
    if (blockedTerms.some(term => query.toLowerCase().includes(term))) {
        return false;
    }
    return true;
}

function queryProcessor(query, history) {

    const normalized =
        query.trim().toLowerCase();

    let intent = 'general';

    // --- CAREER / JOBS ---
    if (
        /career|job|salary|resume|interview|employment|profession|skill/.test(normalized)
    ) {
        intent = 'career';
    }

    // --- BUSINESS / ENTREPRENEURSHIP ---
    else if (
        /business|startup|market|revenue|profit|investment|company|sales/.test(normalized)
    ) {
        intent = 'business';
    }

    // --- TECHNOLOGY ---
    else if (
        /ai|software|technology|cybersecurity|programming|coding|automation|machine learning/.test(normalized)
    ) {
        intent = 'technology';
    }

    // --- FINANCIAL ---
    else if (
        /stocks|finance|economy|crypto|trading|inflation|banking/.test(normalized)
    ) {
        intent = 'financial';
    }

    // --- HISTORICAL ---
    else if (
        /history|historical|war|empire|civilization|president|ancient/.test(normalized)
    ) {
        intent = 'historical';
    }

    // --- SCIENTIFIC ---
    else if (
        /science|physics|biology|chemistry|space|medical|genetics/.test(normalized)
    ) {
        intent = 'scientific';
    }

    return {
        normalized,
        intent
    };
}

function formatResults(rawText, taskMode, outputLevel) {
    // Currently minimal: just return cleaned text
    // Can be replaced later with scoring, ranking, or structuring
    return rawText;
}

        // ACTIONS
        else if (
            lower.includes("recommend") ||
            lower.includes("suggest") ||
            lower.includes("should") ||
            lower.includes("next step") ||
            lower.includes("consider")
        ) {
            actions.push(line);
        }

        // SIGNALS (light heuristic for now)
        else if (
            lower.includes("trend") ||
            lower.includes("signal") ||
            lower.includes("indicates") ||
            lower.includes("pattern")
        ) {
            signals.push(line);
        }

        // EVERYTHING ELSE
        else {
            insight.push(line);
        }
    }

    return { snapshot, actions, signals, insight };
}

exports.handler = async (event, context) => {
    // 1️⃣ Preflight OPTIONS
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: CORS_HEADERS, body: "" };
    }

    // 2️⃣ API Key
    const apiKey = process.env.FIRST_API_KEY;
    if (!apiKey) {
        return {
            statusCode: 500,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: "Server error: FIRST_API_KEY not set." }),
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: "Method Not Allowed" }),
        };
    }

    // 3️⃣ Parse body
    let body;
    try {
        body = JSON.parse(event.body);
    } catch {
        return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: "Invalid JSON body." })
        };
    }

    const { query, taskMode, outputLevel = 'default', language = 'en', history = [] } = body;

    if (!query) {
        return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: "Missing field: query." })
        };
    }

    if (!safetyCheck(query)) {
        return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: "Query contains disallowed terms." })
        };
    }

    const queryObj = queryProcessor(query, history);

    const model = "gemini-2.5-flash";
    let temperature = 0.35;

    let levelModifier = "";

if (outputLevel === 'simplified') {
    levelModifier =
        " Explain clearly and simply while preserving intelligence.";
}

if (outputLevel === 'professional') {
    levelModifier =
        " Provide deeper strategic and technical insight where useful.";
}

   const systemPrompt = `${levelModifier}

Respond in ${language}.

You are a structured intelligence engine.

Your output MUST follow this exact JSON schema:

{
  "snapshot": ["..."],
  "actions": ["..."],
  "signals": ["..."],
  "insight": ["..."],
  "main": "...",
  "confidence": 0
}

STRICT RULES:
- Output ONLY valid JSON
- Do NOT include markdown
- Do NOT include explanations
- Do NOT wrap in backticks
- Do NOT add extra keys
- Every key must exist even if empty
- All values must be strings or arrays of strings

FIELD DEFINITIONS:

snapshot:
- High-level summary of the situation
- Core overview of what is happening

actions:
- Clear recommended actions
- Imperatives, next steps, decisions

signals:
- Patterns, trends, implications, inferred meaning

insight:
- Deep analysis, reasoning, interpretation

main:
- Full coherent readable report in paragraph form

confidence:
- Integer from 0 to 100
- Represents confidence in the overall analysis
- Higher confidence = clearer consensus and stronger evidence
- Lower confidence = ambiguity, uncertainty, conflicting signals, or limited evidence

STYLE RULES:
- Be precise and structured
- Avoid repetition
- Avoid filler language
- Prioritize clarity over verbosity
`;
    // 5️⃣ Build contents array (history + current query)
    const contents = history.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text }]
    }));

    contents.push({
        role: "user",
        parts: [{ text: query }]
    });

    const payload = {
        contents,
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
            temperature
        },
        tools: [{ "google_search": {} }],
        safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" }
        ]
    };

    const maxRetries = 2;
let response;

for (let i = 0; i < maxRetries; i++) {

    const controller = new AbortController();

    const timeout = setTimeout(() => {
        controller.abort();
    }, 28000);

    try {

        response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload),
                signal: controller.signal
            }
        );

        clearTimeout(timeout);

        if (response.ok || response.status !== 429) {
            break;
        }

        console.warn(
            `[${new Date().toISOString()}] Retry triggered from status ${response.status}`
        );

        await new Promise(r =>
            setTimeout(r, (i + 1) * 1500)
        );

    } catch (err) {

        clearTimeout(timeout);

        console.error(
            `[${new Date().toISOString()}] RequestID=${context.awsRequestId} | Attempt ${i + 1} failed:`,
            err.message
        );

        if (i === maxRetries - 1) {
            throw new Error("Gemini API call failed after multiple retries.");
        }

        await new Promise(r =>
            setTimeout(r, (i + 1) * 1500)
        );
    }
}

    if (!response || !response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const status = response ? response.status : 503;
        const message = errorBody.error?.message || "Internal error during API call.";

        console.error(`[${new Date().toISOString()}] RequestID=${context.awsRequestId} | Status: ${status} | Message: ${message}`);

        return {
            statusCode: status,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: `RyGuy API Call Failed: ${message}` })
        };
    }

    const result = await response.json();

const candidate = result.candidates?.[0];

if (candidate && candidate.content?.parts?.[0]?.text) {

   const rawText =
    candidate.content.parts[0].text;

const cleanedText = rawText
    .replace(/```json/g, '')
    .replace(/```/g, '')
    .trim();

let parsed;

try {

    parsed = JSON.parse(cleanedText);

} catch (err) {

    console.error(
        "JSON PARSE FAILURE:",
        err.message
    );

    parsed = {
        snapshot: [],
        actions: [],
        signals: [],
        insight: [],
        main: cleanedText
    };
}
const snapshot =
    Array.isArray(parsed.snapshot)
        ? parsed.snapshot
        : [];

const actions =
    Array.isArray(parsed.actions)
        ? parsed.actions
        : [];

const signals =
    Array.isArray(parsed.signals)
        ? parsed.signals
        : [];

const insight =
    Array.isArray(parsed.insight)
        ? parsed.insight
        : parsed.insight
            ? [String(parsed.insight)]
            : [];

const main =
    typeof parsed.main === "string"
        ? parsed.main
        : "";

const finalOutput =
  `${main}

Key Takeaways:
${snapshot.length ? snapshot.join("\n") : "—"}

Recommended Actions:
${actions.length ? actions.join("\n") : "—"}

Signals:
${signals.length ? signals.join("\n") : "—"}

Insight:
${insight.length ? insight.join("\n") : "—"}

Confidence Score: ${parsed.confidence ?? 0}/100
`.trim();
    
    // --- KEYWORD EXTRACTION ---
    const extractedKeywords = [...new Set(
    finalOutput
        .replace(/\n/g, ' ')
        .match(/\b([A-Z][a-zA-Z]{4,}|strategy|market|system|analysis|growth|risk|data|insight|opportunity|performance|structure|optimization|behavior)\b/g)
        || []
)].slice(0, 10);

    // --- GROUNDING METADATA PARSING ---
    let extractedSources = [];

const groundingChunks =
    candidate.groundingMetadata?.groundingChunks ||
    result.candidates?.[0]?.groundingMetadata?.groundingChunks ||
    [];

    groundingChunks.forEach(chunk => {

        if (chunk.web) {

            extractedSources.push({
                title: chunk.web.title || "Untitled Source",
                uri: chunk.web.uri || "#"
            });

        }

    });

    // remove duplicates
    extractedSources = extractedSources.filter(
        (source, index, self) =>
            index === self.findIndex(
                s => s.uri === source.uri
            )
    );

    return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({

    report_text: finalOutput, // keep your existing main panel EXACTLY the same

    snapshot,
actions,
signals,
insight,

    keywords: extractedKeywords,
    sources: extractedSources,

    meta: {
        taskMode,
        outputLevel,
        timestamp: new Date().toISOString(),
        intent: queryObj.intent
    }
})
    };
}

    return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({ message: "RyGuy API returned empty content." })
    };
};
