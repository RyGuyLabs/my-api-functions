exports.handler = async (event) => {
  // --- CORS Preflight ---
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

  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  const apiKey = process.env.FIRST_API_KEY;
  if (!apiKey) return {
    statusCode: 500,
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({ error: "API Key not found in environment." }),
  };

  try {
    const { target, context } = JSON.parse(event.body);

    const systemPrompt = `
      You are a Strategic Negotiation Agent. 
      Target: ${target}
      Logic: ${context}

      Task:
      1. Identify a real-time pain point for this target using search grounding.
      2. Generate a "No-Oriented" CTA.
      3. Provide 3 high-status negotiation rules.

      Return ONLY a valid JSON object:
      {
        "pain_point": "string",
        "cta": "string",
        "rules": [{"title": "string", "description": "string"}]
      }
    `;

    // --- Call Gemini API with Google Search ---
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt }] }],
          tools: [{ "google_search": {} }],
        }),
      }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Gemini API Error ${response.status}: ${text}`);
    }

    const data = await response.json();
    const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    // --- Parse Gemini text into JSON ---
    let parsed;
    try {
      parsed = JSON.parse(aiText);
    } catch (e) {
      return {
        statusCode: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Failed to parse Gemini response", text: aiText }),
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(parsed),
    };

  } catch (err) {
    console.error("Worker Error:", err);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Execution failed", message: err.message }),
    };
  }
};
