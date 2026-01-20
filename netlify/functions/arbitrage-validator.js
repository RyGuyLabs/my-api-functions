const { GoogleGenerativeAI } = require("@google/generative-ai");

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: ""
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method Not Allowed" })
    };
  }

  try {
    if (!event.body) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Missing request body" })
      };
    }

    const parsed = JSON.parse(event.body);
    const careerPath = parsed.asset;

    if (!careerPath) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Missing asset field" })
      };
    }

    const apiKey = process.env.FIRST_API_KEY;
    if (!apiKey) {
      throw new Error("Missing FIRST_API_KEY environment variable");
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash-preview-09-2025",
      tools: [{ google_search: {} }]
    });

    const prompt = `
PERFORM MARKET SCRAPE FOR: "${careerPath}"

OBJECTIVE: Identify high-ROI arbitrage opportunities.
1. Find current freelance/contract rates (Upwork, TopTal, Niche boards).
2. Find underserved niche consulting gaps.
3. Identify "High-Ticket" specific tasks that pay a disproportionate hourly rate.

OUTPUT REQUIREMENTS:
- Ignore career satisfaction. Focus 100% on ROI.
- Create a "Money-to-Task" matrix showing exactly how much specific tasks in this field pay right now.

RETURN JSON ONLY:
{
  "verdict": "e.g., HIGH EXPLOITATION POTENTIAL",
  "roi": "e.g., $250/hr average",
  "matrix": [
    {"task": "Specific Task Name", "value": "$ amount"}
  ],
  "logistics": ["Market Gap 1"],
  "risks": ["Slippage risk"],
  "steps": ["Step 1", "Step 2"]
}
`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in model response");
    }

    return {
      statusCode: 200,
      headers,
      body: jsonMatch[0]
    };

  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "Neural link timeout during market scrape."
      })
    };
  }
};
