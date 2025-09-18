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
  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { leadData } = JSON.parse(event.body || "{}");

    if (!leadData) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "Missing leadData" }),
      };
    }

    // Initialize the chat session
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    const conversation = model.startChat();

    // Send a simple prompt
    const result = await conversation.sendMessage([
      {
        role: "user",
        parts: [
          {
            text: `Generate a simple JSON report for this lead:\n${JSON.stringify(
              leadData,
              null,
              2
            )}`,
          },
        ],
      },
    ]);

    // Extract text response
    const candidate = result.response.candidates?.[0];
    let textResponse = "";

    if (candidate?.content?.parts) {
      for (const part of candidate.content.parts) {
        if (part.text) textResponse += part.text + "\n";
      }
    }

    const rawText = textResponse.trim() || "No response generated.";

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch (err) {
      // Fallback if AI response isn't perfect JSON
      parsed = { report: rawText };
    }

    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify(parsed),
    };
  } catch (error) {
    console.error("Lead qualifier error:", error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Failed to generate lead report." }),
    };
  }
};
