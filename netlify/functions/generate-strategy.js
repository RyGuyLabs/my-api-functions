const fetch = require("node-fetch");

exports.handler = async (event) => {
  /* ---------------------------------
     CORS (Squarespace requires this)
  ---------------------------------- */
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

  /* ---------------------------------
     Environment Validation
  ---------------------------------- */
  const apiKey = process.env.FIRST_API_KEY;

  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        error: "API key FIRST_API_KEY not found in environment"
      })
    };
  }

  /* ---------------------------------
     Parse Request
  ---------------------------------- */
  let target, context;

  try {
    const body = JSON.parse(event.body);
    target = body.target;
    context = body.context;
  } catch (e) {
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Invalid JSON body" })
    };
  }

  /* ---------------------------------
     Prompt (NO tools, NO mime forcing)
  ---------------------------------- */
  const prompt = `
You are a strategic negotiation analyst.

Target audience:
${target}

Analysis focus:
${context}

Return a VALID JSON object with EXACTLY this structure:

{
  "pain_point": "string",
  "cta": "string",
  "rules": [
    { "title": "string", "description": "string" }
  ]
}

Rules:
- No markdown
- No commentary
- No extra text
- JSON ONLY
`;

  try {
    /* ---------------------------------
       Gemini API Call
    ---------------------------------- */
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

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API Error ${response.status}: ${errorText}`);
    }

    const raw = await response.json();
    const aiText =
      raw?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    /* ---------------------------------
       Safe JSON Parsing
    ---------------------------------- */
    let parsed;
    try {
      parsed = JSON.parse(aiText);
    } catch {
      parsed = {};
    }

    /* ---------------------------------
       Enforced Response Contract
    ---------------------------------- */
    const safeResponse = {
      pain_point:
        parsed.pain_point || "No clear pain point identified.",
      cta:
        parsed.cta ||
        "Would it be a bad idea to explore whether this is worth addressing?",
      rules: Array.isArray(parsed.rules) ? parsed.rules : []
    };

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify(safeResponse)
    };

  } catch (err) {
    console.error("Execution failed:", err);

    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        error: "Execution failed",
        message: err.message
      })
    };
  }
};
