const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "https://www.ryguylabs.com",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
};

exports.handler = async (event, context) => {
    // 1️⃣ Preflight OPTIONS
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS_HEADERS, body: "" };

    // 2️⃣ API Key
    const apiKey = process.env.FIRST_API_KEY;
    if (!apiKey) return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({ message: "Server error: FIRST_API_KEY not set." }),
    };

    if (event.httpMethod !== 'POST') return {
        statusCode: 405,
        headers: CORS_HEADERS,
        body: JSON.stringify({ message: "Method Not Allowed" }),
    };

    let body;
    try { body = JSON.parse(event.body); } 
    catch { return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: "Invalid JSON body." }) }; }

    const { query, taskMode, outputLevel = 'default', language = 'en', history = [] } = body;
    if (!query) return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: "Missing field: query." }) };

    // 3️⃣ System prompt & temperature
    const model = "gemini-2.5-flash";
    let systemPromptBase = "", temperature = 0.2;

    switch (taskMode) {
        case 'summary':
            systemPromptBase = "Summarize the user's query into 3-5 high-impact, bulleted key points for a leadership audience. Be succinct and professional.";
            temperature = 0.1; break;
        case 'brainstorm':
            systemPromptBase = "Generate multiple, diverse, innovative ideas for the user's query. Use an encouraging and expansive tone.";
            temperature = 0.9; break;
        case 'report':
        default:
            systemPromptBase = "Provide a concise, insightful report based on the latest information.";
            temperature = 0.2; break;
    }

    let levelModifier = "";
    switch (outputLevel) {
        case 'simplified':
            levelModifier = " Use simple, clear language anyone can understand. Include examples if helpful."; break;
        case 'collegiate':
            levelModifier = " Use language suitable for college students; moderate technical depth."; break;
        case 'professional':
            levelModifier = " Use advanced, professional or doctoral-level language."; break;
        default: break;
    }

    const systemPrompt = `${systemPromptBase}${levelModifier} Respond in ${language}. Return JSON with keys: 'report_text', 'keywords', 'sources'.`;

    // 4️⃣ Build contents array (history + current query)
    const contents = history.map((msg, idx) => ({
        author: idx % 2 === 0 ? "user" : "assistant",
        parts: [{ text: msg.text }]
    }));
    contents.push({ role: "user", parts: [{ text: query }] });

    const payload = {
        contents,
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
            temperature,
            responseMimeType: "application/json",
            responseSchema: {
                type: "object",
                properties: {
                    report_text: { type: "string" },
                    keywords: { type: "array", items: { type: "string" } },
                    sources: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: { title: { type: "string" }, uri: { type: "string" } },
                            required: ["title", "uri"]
                        }
                    }
                },
                required: ["report_text", "keywords"]
            }
        },
        tools: [{ "google_search": {} }],
        safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" }
        ]
    };

    // 5️⃣ Call Gemini API with retries & timeout
    const maxRetries = 5;
    let response;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000); // 15s max

    for (let i = 0; i < maxRetries; i++) {
        try {
            response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal
            });
            if (response.ok || response.status !== 429) break;
            await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000 + Math.random() * 1000));
        } catch (err) {
            console.error(`[${new Date().toISOString()}] RequestID=${context.awsRequestId} | Attempt ${i+1} failed:`, err.message);
            if (i === maxRetries -1) throw new Error("Gemini API call failed after multiple retries.");
            await new Promise(r => setTimeout(r, Math.pow(2,i)*1000 + Math.random()*1000));
        }
    }
    clearTimeout(timeout);

    if (!response || !response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const status = response ? response.status : 503;
        const message = errorBody.error?.message || "Internal error during API call.";
        console.error(`[${new Date().toISOString()}] RequestID=${context.awsRequestId} | Status: ${status} | Message: ${message}`);
        return { statusCode: status, headers: CORS_HEADERS, body: JSON.stringify({ message: `RyGuy API Call Failed: ${message}` }) };
    }

    // 6️⃣ Process Gemini response
    const result = await response.json();
    const candidate = result.candidates?.[0];
    if (candidate && candidate.content?.parts?.[0]?.text) {
        let parsed;
        try { parsed = JSON.parse(candidate.content.parts[0].text); } 
        catch { parsed = { report_text: candidate.content.parts[0].text, keywords: [], sources: [] }; }

        return {
            statusCode: 200,
            headers: CORS_HEADERS,
            body: JSON.stringify({
                ...parsed,
                meta: { taskMode, outputLevel, timestamp: new Date().toISOString() }
            })
        };
    } else {
        return {
            statusCode: 500,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: "RyGuy API returned empty or unparseable content." })
        };
    }
};
