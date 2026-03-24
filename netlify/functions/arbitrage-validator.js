const { GoogleGenerativeAI } = require("@google/generative-ai");
const rateLimitStore = new Map();

const headers = {
  "Access-Control-Allow-Origin": "https://www.ryguylabs.com",
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

// Strict AI JSON validation
function validateJSON(raw) {
  const safe = normalizeResponse(raw);

  safe.matrix = safe.matrix.map(m => ({
    task: String(m.task || "Unknown Task"),
    value: String(m.value || "$0.00")
  }));

  safe.comparisons = safe.comparisons.map(c => ({
    market: String(c.market || "Unknown Market"),
    roi: String(c.roi || "N/A"),
    delta: String(c.delta || "0%")
  }));

  return safe;
}

exports.handler = async (event) => {

  const allowedOrigins = ["https://www.ryguylabs.com", "https://ryguylabs.com"];
  const requestOrigin = event.headers?.origin || event.headers?.Origin;

  // Clone headers per request to avoid mutating the global headers object
  const responseHeaders = { ...headers };
  responseHeaders["Access-Control-Allow-Origin"] = allowedOrigins.includes(requestOrigin)
    ? requestOrigin
    : allowedOrigins[0];

  const ip = (event.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";

  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxRequests = 10;

  if (!rateLimitStore.has(ip)) {
    rateLimitStore.set(ip, { count: 1, start: now });
  } else {
    const data = rateLimitStore.get(ip);

    if (now - data.start < windowMs) {
      data.count++;

      if (data.count > maxRequests) {
        return {
          statusCode: 429,
          headers: responseHeaders,
          body: JSON.stringify({ error: "Too many requests. Slow down." })
        };
      }
    } else {
      rateLimitStore.set(ip, { count: 1, start: now });
    }
  }

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: responseHeaders, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { ...responseHeaders, Allow: "POST, OPTIONS" },
      body: JSON.stringify({ error: "Method Not Allowed" })
    };
  }

  try {
    if (!event.body) throw new Error("Missing body");

    const { asset } = JSON.parse(event.body);
    if (!asset) throw new Error("Missing asset");

    const tier = event.headers["x-user-tier"] || "free";

    const apiKey = process.env.FIRST_API_KEY;
    if (!apiKey) throw new Error("Missing API key");

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `
You are a simple, clear market analysis engine.

Respond with VALID JSON ONLY. No extra text.

Use plain, easy-to-understand language. Avoid jargon.

Schema:
{
  "verdict": "short, clear conclusion (1 sentence)",
  "roi": "estimated $/hour range",
  "matrix": [{"task":"simple task name","value":"$/hr"}],
  "logistics": ["simple practical insight"],
  "risks": ["clear risk"],
  "steps": ["very actionable step"],
  "comparisons": [{"market":"name","roi":"$/hr","delta":"% difference"}]
}

Guidelines:
- Keep sentences short and readable (8th grade level)
- Be practical, not theoretical
- Focus on how someone can actually make money

Analyze this market:
"${asset}"
`;

    // ❌ Remove signal from SDK call; use Promise.race for timeout
    const resultPromise = model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7 }
    });

    let result;
    let result;

try {
  result = await Promise.race([
    resultPromise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Request timed out")), 7000))
  ]);
} catch (err) {
  console.error("AI TIMEOUT OR FAILURE:", err.message);

  // ✅ SAFE FALLBACK (THIS IS THE KEY FIX)
  const fallback = {
    verdict: "MARKET UNCLEAR",
    roi: "N/A",
    matrix: [
      { task: "Basic Market Research", value: "$0–$25/hr" }
    ],
    logistics: [
      "Live data could not load in time",
      "Try a more specific career input"
    ],
    risks: [
      "Analysis may be incomplete due to timeout"
    ],
    steps: [
      "Retry analysis",
      "Refine your search (example: 'B2B SaaS Copywriter')"
    ],
    comparisons: []
  };

  return {
    statusCode: 200,
    headers: responseHeaders,
    body: JSON.stringify(fallback)
  };
}

    const rawText = result.response.text().trim();

    let parsed;

    try {
      // First attempt: direct parse
      parsed = JSON.parse(rawText);

    } catch (err1) {
      try {
        // Second attempt: extract first valid JSON object only
        const firstBrace = rawText.indexOf("{");
        const lastBrace = rawText.lastIndexOf("}");

        if (firstBrace !== -1 && lastBrace !== -1) {
          const sliced = rawText.substring(firstBrace, lastBrace + 1);
          parsed = JSON.parse(sliced);
        } else {
          throw new Error("No JSON structure found");
        }

      } catch (err2) {
        console.error("PARSE FAILURE:", rawText);

        // FINAL FALLBACK (never break frontend)
        parsed = {
          verdict: "UNREADABLE RESPONSE",
          roi: "N/A",
          matrix: [],
          logistics: [],
          risks: ["Model returned malformed JSON"],
          steps: ["Retry request", "Simplify input"],
          comparisons: []
        };
      }
    }

    let safe = validateJSON(parsed);

    if (tier === "free") {
      safe.comparisons = safe.comparisons.slice(0, 1);
    }

    return {
      statusCode: 200,
      headers: responseHeaders,
      body: JSON.stringify(safe)
    };

  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      headers: responseHeaders,
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
