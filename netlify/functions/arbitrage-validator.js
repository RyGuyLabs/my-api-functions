const { GoogleGenerativeAI } = require("@google/generative-ai");
const rateLimitStore = new Map();

const headers = {
  "Access-Control-Allow-Origin": "https://www.ryguylabs.com",
  "Access-Control-Allow-Headers": "Content-Type", // removed x-user-tier since no free tier
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
    comparisons: Array.isArray(raw.comparisons) ? raw.comparisons : [],
    insights: Array.isArray(raw.insights) ? raw.insights : [] // ✅ keep default empty array
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

  // ✅ Use safe.insights instead of raw.insights to prevent breaking output
  safe.insights = safe.insights.slice(0, 4).map(i => ({
    type: String(i.type || "Note"),
    text: String(i.text || "")
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

    // Removed free-tier logic entirely
    // const tier = event.headers["x-user-tier"] || "free";

    const apiKey = process.env.FIRST_API_KEY;
    if (!apiKey) throw new Error("Missing API key");

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `
You are a market insight engine. Generate output **EXACTLY as JSON**, nothing else.  

Schema:
{
  "verdict": "One short, punchy sentence (max 15 words) starting with PURSUE, CAUTION, or AVOID, which will appear bold on the frontend",
  "insights": [
    {"type":"Strength","text":"Single actionable strength (💪 emoji optional)"},
    {"type":"Weakness","text":"Single actionable weakness (⚠️ emoji optional)"},
    {"type":"Opportunity","text":"Specific actionable tip or idea (💡 emoji optional)"},
    {"type":"Risk","text":"Specific risk (❌ emoji optional)"}
  ],
  "roi": "Estimated $/hr range",
  "matrix": [{"task":"simple task name","value":"$/hr"}],
  "steps": ["Very actionable step, 1 per bullet"],
  "comparisons": [{"market":"name","roi":"$/hr","delta":"% difference"}]
}

Guidelines:
- Bold sentence = verdict field
- Follow with multiple bullets in insights
- Use emojis for clarity (💪, ⚠️, 💡, ❌)
- Keep sentences short, actionable, practical
- Focus on earning potential
- Avoid vague language like 'good potential' or 'depends'

Analyze this market:
"${asset}"
`;

    const resultPromise = model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7 }
    });

    let result;

    try {
      result = await Promise.race([
        resultPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("Request timed out")), 15000))
      ]);
    } catch (err) {
      console.error("AI TIMEOUT OR FAILURE:", err.message);

      const fallback = {
        verdict: "MARKET UNCLEAR",
        roi: "N/A",
        matrix: [{ task: "Basic Market Research", value: "$0–$25/hr" }],
        logistics: ["Live data could not load in time", "Try a more specific market input"],
        risks: ["Analysis may be incomplete due to timeout"],
        steps: ["Retry analysis", "Refine your search (example: 'B2B SaaS Copywriter')"],
        comparisons: [],
        insights: [
          { type: "Note", text: "AI timed out, no insights available." }
        ]
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
      parsed = JSON.parse(rawText);
    } catch (err1) {
      try {
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

        parsed = {
          verdict: "UNREADABLE RESPONSE",
          roi: "N/A",
          matrix: [],
          logistics: [],
          risks: ["Model returned malformed JSON"],
          steps: ["Retry request", "Simplify input"],
          comparisons: [],
          insights: [{ type: "Note", text: "No insights could be extracted." }]
        };
      }
    }

    const safe = validateJSON(parsed);

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
        comparisons: [],
        insights: [{ type: "Note", text: "Server failed to process insights." }]
      })
    };
  }
};
