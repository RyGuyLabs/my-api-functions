const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "https://www.ryguylabs.com", // Only allow your exact domain
    "Access-Control-Allow-Methods": "POST, OPTIONS", // Allow POST and preflight OPTIONS
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400" // Cache preflight for 24 hours
};

// Secure proxy to Gemini API, hides API key, handles query + taskMode
exports.handler = async (event, context) => {

    // --- 1. Handle Preflight OPTIONS request ---
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 204,
            headers: CORS_HEADERS,
            body: ""
        };
    }

    // --- 2. Retrieve API Key from Environment ---
    const apiKey = process.env.FIRST_API_KEY;
    if (!apiKey) {
        return {
            statusCode: 500,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: "Server misconfiguration: FIRST_API_KEY not set." })
        };
    }

    // --- 3. Enforce POST method ---
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: "Method Not Allowed" })
        };
    }

    // --- 4. Parse JSON body safely ---
    let body;
    try {
        body = JSON.parse(event.body);
    } catch (err) {
        return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: "Invalid JSON body." })
        };
    }

    const { query, taskMode } = body;
    if (!query) {
        return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: "Missing required field: query." })
        };
    }

    // --- 5. Dynamic model & prompt configuration ---
    let systemPrompt = "";
    let temperature = 0.2;
    const model = "gemini-2.5-flash"; // Supported production model

    switch (taskMode) {
        case 'summary':
            systemPrompt = "You are a senior executive assistant. Summarize the user's query into 3-5 high-impact, bulleted key points for a leadership audience. Be succinct and professional.";
            temperature = 0.1;
            break;
        case 'brainstorm':
            systemPrompt = "You are a creative strategist. Generate multiple, diverse, and innovative ideas or solutions for the user's query. Use an encouraging and expansive tone.";
            temperature = 0.9;
            break;
        case 'report':
        default:
            systemPrompt = "You are a concise, insightful data analyst providing grounded reports based on the latest available information.";
            temperature = 0.2;
            break;
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const payload = {
        contents: [{ parts: [{ text: query }] }],
        tools: [{ "google_search": {} }], // Enable Google Search grounding
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { temperature }
    };

    // --- 6. Gemini API call with retry ---
    const maxRetries = 5;
    let response;

    for (let i = 0; i < maxRetries; i++) {
        try {
            response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok || response.status !== 429) break; // Stop retry on success or non-rate-limit error

            // Exponential backoff + jitter
            const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
            console.warn(`Gemini API rate-limited. Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));

        } catch (err) {
            console.error(`Attempt ${i + 1} failed (network error):`, err.message);
            if (i === maxRetries - 1) throw new Error("Persistent network issues; Gemini API call failed after retries.");
            const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    if (!response || !response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const status = response ? response.status : 503;
        const message = errorBody.error?.message || "Internal server error during API call.";
        return {
            statusCode: status,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: `Gemini API Call Failed: ${message}` })
        };
    }

    // --- 7. Process Gemini response ---
    const result = await response.json();
    const candidate = result.candidates?.[0];

    if (candidate && candidate.content?.parts?.[0]?.text) {
        const text = candidate.content.parts[0].text;

        // Extract grounding sources safely
        const sources = candidate.groundingMetadata?.groundingAttributions
            ?.map(attr => ({ uri: attr.web?.uri, title: attr.web?.title }))
            ?.filter(src => src.uri && src.title) || [];

        return {
            statusCode: 200,
            headers: CORS_HEADERS,
            body: JSON.stringify({ text, sources })
        };
    } else {
        return {
            statusCode: 500,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: "Gemini API returned empty or unparseable content." })
        };
    }
};
