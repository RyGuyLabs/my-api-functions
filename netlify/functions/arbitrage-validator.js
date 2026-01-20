const { GoogleGenerativeAI } = require("@google/generative-ai");

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, x-user-tier",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

function normalizeResponse(raw) {
  return {
    verdict: String(raw.verdict || "INSUFFICIENT SIGNAL"),
    roi: String(raw.roi || "N/A"),
    matrix: Array.isArray(raw.matrix) ? raw.matrix : [],
    logistics: Array.isArray(raw.logistics) ? raw.logistics : [],
    risks: Array.isArray(raw.risks) ? raw.risks : [],
    steps: Array.isArray(raw.steps) ? raw.steps : [],
    comparisons: Array.isArray(raw.comparisons) ? raw.comparisons : []
  };
}

// Validates AI JSON strictly
function validateJSON(raw) {
  const safe = normalizeResponse(raw);
  // Ensure every matrix entry has required keys
  safe.matrix = safe.matrix.map(m => ({
    task: String(m.task || "Unknown Task"),
    value: String(m.value || "$0.00")
  }));
  // Ensure comparisons are well-formed
  safe.comparisons = safe.comparisons.map(c => ({
    market: String(c.market || "Unknown Market"),
    roi: String(c.roi || "N/A"),
    delta: String(c.delta || "0%")
  }));
  return safe;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method Not Allowed" })
    };
  }

  try {
    if (!event.body) throw new Error("Missing body");

    const { asset } = JSON.parse(event.body);
    if (!asset) throw new Error("Missing asset");

    // Tier-based monetization gating
    const tier = event.headers["x-user-tier"] || "free";

    const apiKey = process.env.FIRST_API_KEY;
    if (!apiKey) throw new Error("Missing API key");

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash-preview-09-2025"
    });

    const prompt = `
You are a market arbitrage engine.

Respond with VALID JSON ONLY.
No markdown, no commentary, no backticks.

Schema:
{
  "verdict": "string",
  "roi": "string",
  "matrix": [{"task":"string","value":"string"}],
  "logistics": ["string"],
  "risks": ["string"],
  "steps": ["string"],
  "comparisons": [{"market":"string","roi":"string","delta":"string"}]
}

Analyze this market:
"${asset}"
`;

    const result = await model.generateContent(prompt);
    const rawText = result.response.text().trim();

    // Attempt to extract JSON if wrapped in extra text
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    const extracted = jsonMatch ? jsonMatch[0] : rawText;

    let parsed;
    try {
      parsed = JSON.parse(extracted);
    } catch {
      throw new Error("Model returned invalid JSON");
    }

    let safe = validateJSON(parsed);

    // Tier-based gating
    if (tier === "free") {
      safe.comparisons = safe.comparisons.slice(0, 1);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(safe)
    };

  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        verdict: "ANALYSIS FAILED",
        roi: "N/A",
        matrix: [],
        logistics: [],
        risks: ["Model instability or malformed output"],
        steps: ["Retry request", "Refine market input"],
        comparisons: []
      })
    };
  }
};
