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

// --- STRUCTURED SECTION BUILDER ---
function extractSections(text) {

    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    const snapshot = [];
    const actions = [];
    const signals = [];
    const insight = [];

    for (const line of lines) {

        const lower = line.toLowerCase();

        // SNAPSHOT
        if (
            lower.includes("summary") ||
            lower.includes("overview") ||
            lower.includes("bottom line") ||
            lower.includes("in short")
        ) {
            snapshot.push(line);
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

Your objective:
- Deliver intelligent, useful, readable analysis
- Adapt naturally to the user's query
- Prioritize clarity, depth, and relevance
- Use structure only when beneficial
- Preserve exploratory and analytical flexibility

When helpful, naturally group information using simple labels such as "Summary", "Key Points", "Steps", or "Details". Only use structure when it improves readability. Do not force any format.

Formatting rules:
- No markdown symbols (* or **)
- Use spacing between major ideas
- Use headers naturally when appropriate
- Avoid repetitive phrasing
- Avoid filler summaries
- Do not force sections if they are unnecessary
- When helpful, optionally include lightweight section labels in this format:
  [SECTION: Title]
- Only use section labels when they genuinely improve clarity
- Avoid over-structuring simple responses
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
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

    const finalOutput =
        formatResults(cleanedText, taskMode, outputLevel);

    const sections = extractSections(cleanedText);
    
    // --- KEYWORD EXTRACTION ---
    const extractedKeywords = [...new Set(
    cleanedText
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

    snapshot: sections.snapshot,
    actions: sections.actions,
    signals: sections.signals,
    insight: sections.insight,

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
