export async function handler(event) {
  try {
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
        body: "Method Not Allowed"
      };
    }

    const { target, context } = JSON.parse(event.body || "{}");

    const apiKey = process.env.FIRST_API_KEY;
    if (!apiKey) {
      throw new Error("FIRST_API_KEY missing");
    }

    const prompt = `
Return ONLY valid JSON.
Do NOT include markdown, code fences, or commentary.

Schema:
{
  "pain_point": "string",
  "cta": "string",
  "rules": [
    { "title": "string", "description": "string" }
  ]
}

Target: ${target}
Context: ${context}
`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      }
    );

    const raw = await response.json();

    let text = raw?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error("Gemini returned no text");
    }

    // 🔧 STRIP MARKDOWN CODE FENCES (THE FIX)
    text = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      throw new Error("Invalid JSON returned by model");
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify(parsed)
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({ error: err.message })
    };
  }
}
