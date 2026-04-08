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
    const normalized = query.trim().toLowerCase();
    const intent = normalized.includes('resume') ? 'careerAdvice' : 'general';
    return { normalized, intent };
}

function formatResults(rawText, taskMode, outputLevel) {
    // Currently minimal: just return cleaned text
    // Can be replaced later with scoring, ranking, or structuring
    return rawText;
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
    let systemPromptBase = "", temperature = 0.2;

    switch (taskMode) {
        case 'summary':
            systemPromptBase = "Summarize the topic into concise, high-impact bullet points. Focus only on key takeaways. Avoid long explanations.";
            temperature = 0.1;
            break;

        case 'brainstorm':
            systemPromptBase = "Generate creative, unconventional, and diverse ideas. Push beyond obvious answers. Include unique angles and opportunities.";
            temperature = 0.9;
            break;

        case 'report':
        default:
            systemPromptBase = "Create a structured report with clearly labeled sections: Summary, Key Insights, and Recommendations. Be analytical and well-organized.";
            temperature = 0.2;
            break;
    }

    let levelModifier = "";
    switch (outputLevel) {
        case 'simplified':
            levelModifier = " Use very simple language. Explain concepts clearly with examples.";
            break;
        case 'collegiate':
            levelModifier = " Use college-level explanations with moderate technical depth.";
            break;
        case 'professional':
            levelModifier = " Use advanced, professional, and technical language appropriate for experts.";
            break;
        default:
            break;
    }

    const systemPrompt = `${systemPromptBase}${levelModifier}
Respond in ${language}.
Structure your response with:
- TITLE
- MAIN REPORT (use clear paragraphs)
- KEY INSIGHTS (highlight main concepts)
- CONCLUSION

Formatting rules:
- No markdown (* or **)
- Use clear paragraphs
- Add spacing between sections
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    for (let i = 0; i < maxRetries; i++) {
        try {
            response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    signal: controller.signal
                }
            );

            if (response.ok || response.status !== 429) break;
            await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000 + Math.random() * 1000));

        } catch (err) {
            console.error(`[${new Date().toISOString()}] RequestID=${context.awsRequestId} | Attempt ${i+1} failed:`, err.message);
            if (i === maxRetries - 1) throw new Error("Gemini API call failed after multiple retries.");
            await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000 + Math.random() * 1000));
        }
    }

    clearTimeout(timeout);

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
        const rawText = candidate.content.parts[0].text;

        const cleanedText = rawText
            .replace(/\*\*/g, '')
            .replace(/\*/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

        const finalOutput = formatResults(cleanedText, taskMode, outputLevel);

        return {
            statusCode: 200,
            headers: CORS_HEADERS,
            body: JSON.stringify({
                report_text: finalOutput,
                keywords: [], // can add keyword extraction later
                sources: [],
                meta: { taskMode, outputLevel, timestamp: new Date().toISOString(), intent: queryObj.intent }
            })
        };
    }

    return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({ message: "RyGuy API returned empty content." })
    };
};
