const fetch = require("node-fetch");

exports.handler = async (event) => {

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
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({ error: "Method Not Allowed" })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Invalid JSON input" })
    };
  }

  const { target, context: searchLogic } = body;
  const apiKey = process.env.FIRST_API_KEY;

  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "API key missing" })
    };
  }

  const systemPrompt = `
You are a Social Intelligence & Negotiation Agent.

TARGET: ${target}
LOGIC: ${searchLogic}

Return ONLY valid JSON:
{
  "pain_point": "string",
  "cta": "string",
  "rules": [{"title":"string","description":"string"}]
}
`;

  const apiPayload = {
    contents: [{
      role: "user",
      parts: [{ text: systemPrompt }]
    }],
    tools: [{ google_search: {} }],
    generationConfig: { responseMimeType: "application/json" }
  };

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiPayload)
      }
    );

    const result = await response.json();
    const raw = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!raw) throw new Error("Empty AI response");

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Malformed AI JSON");

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify(parsed)
    };

  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        error: "Intelligence Engine Error",
        message: err.message
      })
    };
  }
};
