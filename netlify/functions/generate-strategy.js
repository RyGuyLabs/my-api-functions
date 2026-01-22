const fetch = require("node-fetch");

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

  // ---------- INPUT ----------
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

  const { target, context } = body;
  const apiKey = process.env.FIRST_API_KEY;

  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "API key missing" })
    };
  }

  // ---------- PROMPT ----------
  const prompt = `
Return ONLY valid JSON.

TARGET:
${target}

INTENT:
${context}

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

  const payload = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ]
  };

  // ---------- GEMINI ----------
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }
    );

    const rawText = await response.text();

    if (!response.ok) {
      throw new Error(`Gemini HTTP ${response.status}: ${rawText}`);
    }

    const parsed = JSON.parse(rawText);

    const candidate = parsed?.candidates?.[0];
    if (!candidate) {
      throw new Error("No candidates returned by Gemini");
    }

    // 🔐 SAFELY EXTRACT *ALL* TEXT PARTS
    const parts = candidate.content?.parts || [];
    const combinedText = parts
      .map(p => p.text)
      .filter(Boolean)
      .join("\n");

    if (!combinedText) {
      throw new Error(
        `Gemini returned no text. Finish reason: ${candidate.finishReason}`
      );
    }

    // 🔍 JSON EXTRACTION
    const jsonMatch = combinedText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON object found in Gemini output");
    }

    const finalOutput = JSON.parse(jsonMatch[0]);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify(finalOutput)
    };

  } catch (err) {
    console.error("BACKEND ERROR:", err);

    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        error: "Gemini execution failed",
        details: err.message
      })
    };
  }
};
