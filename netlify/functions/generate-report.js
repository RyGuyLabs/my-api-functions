const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "https://www.ryguylabs.com", 
    "Access-Control-Allow-Methods": "POST, OPTIONS", 
    "Access-Control-Allow-Headers": "Content-Type",
};

exports.handler = async (event, context) => {

    // 1️⃣ Handle Preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: CORS_HEADERS, body: "" };
    }

    // 2️⃣ Get API Key from environment variables
    const apiKey = process.env.FIRST_API_KEY; 
    if (!apiKey) {
        return {
            statusCode: 500,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: "Server configuration error: FIRST_API_KEY environment variable is not set." }),
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: "Method Not Allowed" }),
        };
    }

    let body;
    try {
        body = JSON.parse(event.body);
    } catch (e) {
        return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: "Invalid JSON body provided." }),
        };
    }

    const { query, taskMode, outputLevel = 'default' } = body;

    if (!query) {
        return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: "Missing required field: query." }),
        };
    }

    // 3️⃣ Dynamic Model Configuration (taskMode + outputLevel)
    let systemPromptBase = "";
    let temperature = 0.2; 
    const model = "gemini-2.5-flash";

    switch (taskMode) {
        case 'summary':
            systemPromptBase = "Summarize the user's query into 3-5 high-impact, bulleted key points for a leadership audience. Be succinct and professional.";
            temperature = 0.1;
            break;
        case 'brainstorm':
            systemPromptBase = "Generate multiple, diverse, and innovative ideas or solutions for the user's query. Use an encouraging and expansive tone.";
            temperature = 0.9;
            break;
        case 'report':
        default:
            systemPromptBase = "Provide a concise, insightful report based on the latest information.";
            temperature = 0.2;
            break;
    }

    let levelModifier = "";
    switch(outputLevel) {
        case 'simplified':
            levelModifier = " Use simple, clear language that anyone can understand. Provide examples if helpful.";
            break;
        case 'collegiate':
            levelModifier = " Use language suitable for college students; include relevant concepts and moderate technical depth.";
            break;
        case 'professional':
            levelModifier = " Use advanced, professional, or academic language appropriate for experts or doctoral-level audiences.";
            break;
        case 'default':
        default:
            levelModifier = ""; 
            break;
    }

    const systemPrompt = `${systemPromptBase}${levelModifier}`;

    // Logging for monitoring
    console.info(`[Gemini Request] ${new Date().toISOString()} | taskMode: ${taskMode} | outputLevel: ${outputLevel} | query length: ${query.length}`);

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const payload = {
        contents: [{ parts: [{ text: query }] }],
        tools: [{ "google_search": {} }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { temperature: temperature }
    };

    // 4️⃣ Call Gemini API with Retry Logic
    const maxRetries = 5;
    let response;

    for (let i = 0; i < maxRetries; i++) {
        try {
            response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok || response.status !== 429) break;

            const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
            console.warn(`Gemini API rate limit hit. Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));

        } catch (err) {
            console.error(`Attempt ${i + 1} failed (Network Error):`, err.message);
            if (i === maxRetries - 1) throw new Error("Gemini API call failed after multiple retries.");
            const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    if (!response || !response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const status = response ? response.status : 503;
        const message = errorBody.error?.message || "Internal server error during API call.";
        console.error(`[Gemini Error] ${new Date().toISOString()} | Status: ${status} | Message: ${message}`);
        return {
            statusCode: status,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: `Gemini API Call Failed: ${message}` }),
        };
    }

    // 5️⃣ Process successful response
    const result = await response.json();
    const candidate = result.candidates?.[0];

    if (candidate && candidate.content?.parts?.[0]?.text) {
        const text = candidate.content.parts[0].text;

        // Extract grounding sources
        let sources = [];
        const groundingMetadata = candidate.groundingMetadata;
        if (groundingMetadata?.groundingAttributions) {
            sources = groundingMetadata.groundingAttributions
                .map(attr => ({ uri: attr.web?.uri, title: attr.web?.title }))
                .filter(s => s.uri && s.title);
        }

        return {
            statusCode: 200,
            headers: CORS_HEADERS,
            body: JSON.stringify({
                text,
                sources,
                meta: { taskMode, outputLevel, timestamp: new Date().toISOString() }
            }),
        };

    } else {
        return {
            statusCode: 500,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: "Gemini API returned empty or unparseable content." }),
        };
    }
};
