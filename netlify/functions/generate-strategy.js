const fetch = require("node-fetch");

exports.handler = async (event) => {
  /* ===============================
     CORS
  =============================== */
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

  /* ===============================
     ENV
  =============================== */
  const apiKey = process.env.FIRST_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "FIRST_API_KEY missing" })
    };
  }

  /* ===============================
     INPUT
  =============================== */
  let target = "";
  let context = "";

  try {
    const body = JSON.parse(event.body);
    target = body.target || "";
    context = body.context || "";
  } catch {
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Invalid JSON body" })
    };
  }

  /* ===============================
     PROMPT (STRICT)
  =============================== */
  const prompt = `
Return ONLY valid JSON.

Target:
${target}

Logic:
${context}

Required JSON shape:
{
  "pain_point": "string",
  "cta": "string",
  "rules": [
    { "title": "string", "description": "string" }
  ]
}

No markdown.
No explanations.
JSON only.
`;

  try {
    /* ===============================
       GEMINI CALL
    =============================== */
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
      const text = await response.text();
      throw new Error(`Gemini ${response.status}: ${text}`);
    }

    const raw = await response.json();
    const rawText =
      raw?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    /* ===============================
       NORMALIZATION LAYER
    =============================== */
    let parsed = {};
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = {};
    }

    // Handle common Gemini variants
    const painPoint =
      parsed.pain_point ||
      parsed.painPoint ||
      parsed.problem ||
      parsed.issue ||
      "";

    const cta =
      parsed.cta ||
      parsed.cta_text ||
      parsed.call_to_action ||
      "";

    let rules = [];
    if (Array.isArray(parsed.rules)) {
      rules = parsed.rules;
    } else if (Array.isArray(parsed.guardrails)) {
      rules = parsed.guardrails;
    } else if (Array.isArray(parsed.negotiation_rules)) {
      rules = parsed.negotiation_rules;
    }

    /* ===============================
       FINAL GUARANTEED RESPONSE
    =============================== */
    const safeResponse = {
      pain_point: painPoint || "No critical pain point could be identified.",
      cta:
        cta ||
        "Would it be unreasonable to explore whether this problem is worth fixing?",
      rules: rules.length
        ? rules.map(r => ({
            title: r.title || "Guideline",
            description: r.description || ""
          }))
        : [
            {
              title: "Default Rule",
              description:
                "Pause, ask calibrated questions, and avoid premature persuasion."
            }
          ],

      // DEBUG — REMOVE LATER
      _debug: {
        raw_model_text: rawText
      }
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
