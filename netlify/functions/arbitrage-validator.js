const { GoogleGenerativeAI } = require("@google/generative-ai");

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
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
    steps: Array.isArray(raw.steps) ? raw.steps : []
  };
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

    const apiKey = process.env.FIRST_API_KEY;
    if (!apiKey) throw new Error("Missing API key");

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash-preview-09-2025"
    });

    const prompt = `
You are a market arbitrage engine.

Respond with **VALID JSON ONLY**.
No markdown.
No commentary.
No backticks.

Schema:
{
  "verdict": "string",
  "roi": "string",
  "matrix": [{"task":"string","value":"string"}],
  "logistics": ["string"],
  "risks": ["string"],
  "steps": ["string"]
}

Analyze this market:
"${asset}"
`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("Model returned invalid JSON");
    }

    const safe = normalizeResponse(parsed);

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
        steps: ["Retry request", "Refine market input"]
      })
    };
  }
};
