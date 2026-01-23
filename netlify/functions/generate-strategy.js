exports.handler = async (event) => {
  // ---------- CORS ----------
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
      },
      body: ""
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Method Not Allowed" })
    };
  }

  // ---------- Parse Input ----------
  let input;
  try {
    input = JSON.parse(event.body);
  } catch {
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Invalid JSON body" })
    };
  }

  const { target, context } = input;

  console.log("Incoming Query:", {
    target,
    context,
    time: new Date().toISOString()
  });

  if (!target || !context) {
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Missing target or context" })
    };
  }

  // ---------- API Key ----------
  const apiKey = process.env.FIRST_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "API key not configured" })
    };
  }

  // ---------- Prompt ----------
  const prompt = `
You are a high-level Social Intelligence & Negotiation Agent.

TARGET: ${target}
INTENT: ${context}

TASK:
1. Identify ONE urgent, real-world pain point this group is experiencing.
2. Create a "No-Oriented" CTA (Chris Voss style).
3. Provide EXACTLY 3 negotiation guardrails.

STRICT OUTPUT:
Return ONLY valid JSON.
Do NOT use markdown.
Do NOT wrap in backticks.

FORMAT:
{
  "pain_point": "string",
  "cta": "string",
  "rules": [
    { "title": "string", "description": "string" },
    { "title": "string", "description": "string" },
    { "title": "string", "description": "string" }
  ]
}
`;

  // ---------- Gemini Request ----------
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }]
        })
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(errText);
    }

    const raw = await response.json();
    let text = raw?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) throw new Error("Empty model response");

    // ---------- Hard JSON Cleanup ----------
    text = text.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("Model returned invalid JSON");
    }

    // ---------- Safe Defaults ----------
    parsed.pain_point ||= "No pain point identified.";
    parsed.cta ||= "No CTA generated.";
    parsed.rules = Array.isArray(parsed.rules) ? parsed.rules.slice(0, 3) : [];

    while (parsed.rules.length < 3) {
      parsed.rules.push({
        title: "Negotiation Rule",
        description: "Maintain calm and control during engagement."
      });
    }

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
      body: JSON.stringify({
        error: "Execution failed",
        message: error.message
      })
    };
  }
};
