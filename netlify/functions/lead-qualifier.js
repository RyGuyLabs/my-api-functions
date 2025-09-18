// File: netlify/functions/lead-qualifier.js
const { GoogleGenerativeAI } = require("@google/generative-ai");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const genAI = new GoogleGenerativeAI(process.env.FIRST_API_KEY);

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
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "Missing leadData" }),
      };
    }

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    const conversation = model.startChat({ history: [] });

    const result = await conversation.sendMessage([{
      role: "user",
      parts: [{
        text: `You are a top-tier sales consultant. Generate a short summary about this lead in JSON: ${JSON.stringify(leadData)}`
      }]
    }]);

    let rawText = "";
    const candidate = result.response.candidates?.[0];
    if (candidate?.content?.parts) {
      for (const part of candidate.content.parts) {
        if (part.text) rawText += part.text;
      }
    }

    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ result: rawText.trim() || "No output from AI." }),
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
