const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.FIRST_API_KEY);

exports.handler = async (event) => {
  const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  try {
    const { leadData } = JSON.parse(event.body);
    if (!leadData) return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "Missing leadData" }) };

    const prompt = `You are a top-tier sales consultant. Generate a structured JSON report about this lead: ${JSON.stringify(leadData)}`;

    const response = await genAI.generateText({
      model: "gemini-1.5-pro",
      prompt,
      temperature: 0.7,
      maxOutputTokens: 500,
    });

    const resultText = response.candidates?.[0]?.content || "No output from AI.";

    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ result: resultText }),
    };

  } catch (err) {
    console.error("Lead qualifier error:", err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Failed to generate lead report. Check server logs." }),
    };
  }
};
