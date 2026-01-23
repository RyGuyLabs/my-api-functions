const fetch = require('node-fetch');

exports.handler = async (event) => {
  // --- 1. Handle CORS Preflight (Squarespace friendly)
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: "",
    };
  }

  // --- 2. Allow only POST
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  // --- 3. Check API Key
  const apiKey = process.env.FIRST_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "API Key 'FIRST_API_KEY' not found in environment." }),
    };
  }

  try {
    // --- 4. Parse user input
    const { target, context } = JSON.parse(event.body);

    console.log("Incoming Query:", { target, context, time: new Date().toISOString() });

    // --- 5. Build system prompt
    const systemPrompt = `
You are a Strategic Negotiation & Social Intelligence Agent.
Target: ${target}
Logic: ${context}

TASK:
1. Identify ONE real-time urgent pain point for this target (last 6 months social/news posts).
2. Generate a "No-Oriented" CTA (e.g., "Would it be a bad idea to...").
3. Provide 3 high-status negotiation rules.

OUTPUT FORMAT: ONLY return valid JSON exactly like this:
{
  "pain_point": "string",
  "cta": "string",
  "rules": [{"title": "string", "description": "string"}]
}
`;

    // --- 6. Prepare API request
    const apiPayload = {
      contents: [{ parts: [{ text: systemPrompt }] }],
      tools: [], // Removed google_search for now due to API limitations
      generationConfig: { responseMimeType: "application/json" }
    };

    // --- 7. Fetch with retry + timeout
    const fetchWithRetry = async (url, options, retries = 3, delay = 1000) => {
      for (let i = 0; i < retries; i++) {
        try {
          const controller = new AbortController();
          const id = setTimeout(() => controller.abort(), 8000); // 8s timeout
          const res = await fetch(url, { ...options, signal: controller.signal });
          clearTimeout(id);

          if (!res.ok) {
            const text = await res.text();
            if (i === retries - 1) throw new Error(`Gemini API Error: ${res.status} - ${text}`);
            await new Promise(r => setTimeout(r, delay));
            delay *= 2;
            continue;
          }
          return await res.json();
        } catch (err) {
          if (i === retries - 1) throw err;
          await new Promise(r => setTimeout(r, delay));
          delay *= 2;
        }
      }
    };

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
    const result = await fetchWithRetry(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(apiPayload),
    });

    // --- 8. Extract and validate AI response
    const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error("Empty AI response");

    let parsed;
    try {
      parsed = JSON.parse(rawText.replace(/```json|```/g, '').trim());
    } catch (err) {
      throw new Error("Invalid JSON from AI: " + err.message);
    }

    // --- 9. Validate fields and provide defaults
    parsed.pain_point = parsed.pain_point || "No pain point identified.";
    parsed.cta = parsed.cta || "No CTA generated.";
    parsed.rules = Array.isArray(parsed.rules) && parsed.rules.length ? parsed.rules : [
      { title: "Default Rule", description: "No negotiation rules generated." }
    ];

    // --- 10. Return response
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify(parsed)
    };

  } catch (error) {
    console.error("Backend Error:", error.message);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Execution failed", message: error.message })
    };
  }
};
