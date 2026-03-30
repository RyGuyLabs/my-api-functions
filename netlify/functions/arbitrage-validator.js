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
    verdict: String(raw.verdict || "NO SIGNAL"),
    roi: String(raw.roi || "$0"),
    matrix: Array.isArray(raw.matrix) ? raw.matrix : [{ task: "No data", value: "$0" }],
    logistics: Array.isArray(raw.logistics) ? raw.logistics : [],
    risks: Array.isArray(raw.risks) ? raw.risks : [],
    steps: Array.isArray(raw.steps) ? raw.steps : ["Retry with more specific input"],
    comparisons: Array.isArray(raw.comparisons) ? raw.comparisons : [],
    insights: Array.isArray(raw.insights) ? raw.insights : [],
    exploits: Array.isArray(raw.exploits) ? raw.exploits : [],
    firstMoves: Array.isArray(raw.firstMoves) ? raw.firstMoves : [],
    costOfInaction: String(raw.costOfInaction || "")
  };
}

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

  safe.insights = safe.insights.slice(0, 8).map(i => ({
    type: String(i.type || "Note"),
    text: String(i.text || "")
  }));

  safe.exploits = safe.exploits.slice(0, 5).map(e => String(e));
  safe.firstMoves = safe.firstMoves.slice(0, 3).map(m => String(m));
  safe.costOfInaction = String(safe.costOfInaction || "");

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

    const apiKey = process.env.FIRST_API_KEY;
    if (!apiKey) throw new Error("Missing API key");

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `
You are a market insight engine. Generate output **EXACTLY as JSON**, nothing else.  

Schema:
{
  "verdict": "Start with PURSUE, CAUTION, or AVOID. Then a blunt, high-stakes reason (max 12 words). No fluff.",
  "insights": [
  {"type":"Strength","text":"Single actionable strength"},
  {"type":"Weakness","text":"Single actionable weakness"},

  {"type":"Opportunity","text":"Exploit: pricing gap, niche, or arbitrage angle"},
  {"type":"Opportunity","text":"Exploit: underserved segment or buyer type"},
  {"type":"Opportunity","text":"Exploit: faster acquisition channel or tactic"},
  {"type":"Opportunity","text":"Exploit: productized service or packaging angle"},

  {"type":"Risk","text":"Specific risk"}
],
  "roi": "Estimated $/hr range",
  "matrix": [{"task":"simple task name","value":"$/hr"}],
  "steps": ["Very actionable step, 1 per bullet"],
  "comparisons": [{"market":"name","roi":"$/hr","delta":"% difference"}],
"exploits": [
  "Specific monetization angle",
  "Underserved niche to target",
  "Pricing arbitrage opportunity",
  "Distribution or acquisition hack"
],
"firstMoves": [
  "3 aggressive, immediate money-making actions (under 30 minutes each)"
],
"costOfInaction": "Dollar-based loss per day and month if ignored"
}

Guidelines:
- Bold sentence = verdict field
- Follow with multiple bullets in insights
- Use emojis for clarity (💪, ⚠️, 💡, ❌)
- Each insight must be <= 12 words
- Be blunt, decisive, and specific (no corporate tone)
- No filler words (avoid: "can", "may", "helps", "generally")
- Focus on money, leverage, or risk ONLY
- Every line should feel like a decision trigger
- Avoid generic phrases completely
- firstMoves MUST be tactical, fast, and revenue-focused
- Each firstMove must be executable immediately (no prep, no learning phase)
- costOfInaction MUST include real dollar estimates per day and month
- Tie costOfInaction to missed deals, pricing gaps, or demand inefficiencies

Opportunity rules:
- Must be directly monetizable within 24–72 hours
- Must describe a gap, inefficiency, or arbitrage angle
- Avoid vague advice — every opportunity should imply a SELLABLE action
- Think: "How does someone make money from this immediately?"
- Prioritize pricing gaps, speed advantages, niche specialization, or distribution hacks

Examples of GOOD:
"Charge $150+/hr by specializing in SaaS onboarding flows"
"Entry-level saturated; skip unless you have niche proof"
"Cold outreach to agencies yields faster clients than job boards"

Examples of BAD:
"Has strong potential in many industries"
"Can be a good career depending on skills"

Verdict Rules:
- MUST start with PURSUE, CAUTION, or AVOID
- MUST be punchy and specific (no fluff)
- MUST include a real constraint, advantage, or condition
- DO NOT say 'good potential' or anything vague
- Think like a trader making a fast decision

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

if (!parsed || typeof parsed !== "object") parsed = {};

if (!Array.isArray(parsed.firstMoves)) parsed.firstMoves = [];
if (typeof parsed.costOfInaction !== "string") parsed.costOfInaction = "";
    const safe = validateJSON(parsed);
    // 🔹 SMART COST OF INACTION (OVERRIDES AI IF WE CAN CALCULATE)

function extractBaseROI(roiStr) {
  if (!roiStr) return 0;
  const matches = String(roiStr).match(/[\d.]+/g);
  if (!matches) return 0;

  const nums = matches.map(n => parseFloat(n)).filter(n => !isNaN(n));
  if (!nums.length) return 0;

  // If range → average it
  if (nums.length >= 2) {
    return (nums[0] + nums[1]) / 2;
  }

  return nums[0];
}

const baseROI = extractBaseROI(safe.roi);

// Estimate realistic daily opportunity window
let opportunityMultiplier = 2; // default: 2 hours/day

if (safe.exploits.length >= 3) opportunityMultiplier = 3;
if (safe.comparisons.length >= 3) opportunityMultiplier += 1;

// Calculate losses
if (baseROI > 0) {
  const dailyLoss = baseROI * opportunityMultiplier;
  const monthlyLoss = dailyLoss * 30;

  safe.costOfInaction = `$${dailyLoss.toFixed(0)}/day (~$${monthlyLoss.toFixed(0)}/month) in missed opportunity based on current market gaps`;
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
        comparisons: [],
        insights: [{ type: "Note", text: "Server failed to process insights." }]
      })
    };
  }
};
