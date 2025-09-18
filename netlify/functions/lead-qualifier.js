// File: netlify/functions/lead-qualifier.js
const { GoogleGenerativeAI } = require("@google/generative-ai");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const geminiApiKey = process.env.FIRST_API_KEY;
const genAI = new GoogleGenerativeAI(geminiApiKey);

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { leadData } = JSON.parse(event.body);
    if (!leadData) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "Missing leadData" }) };
    }

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-turbo" });
    const conversation = model.startChat({ history: [] });

    const result = await conversation.sendMessage([{
      role: "user",
      parts: [{ text: `Generate a simple sales report for this lead:\n${JSON.stringify(leadData, null, 2)}` }],
    }]);

    const rawText = result.response.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated.";

    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ result: rawText }),
    };
    console.log("API Key:", !!process.env.FIRST_API_KEY);


  } catch (err) {
    console.error("Lead qualifier error:", err);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: "Failed to generate lead report." }) };
  }
};
