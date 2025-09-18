const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.FIRST_API_KEY);

exports.handler = async (event) => {
  const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS_HEADERS, body: "Method Not Allowed" };
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

    // --- Chat-based approach ---
    const model = genAI.getGenerativeModel({ model: "gemini-1.5" });
    const conversation = model.startChat({ history: [] });

    const result = await conversation.sendMessage([{
      role: "user",
      parts: [
        {
          text: `Generate a sales report for the following lead:\n${JSON.stringify(leadData, null, 2)}`
        }
      ]
    }]);

    const rawText = result.response?.candidates?.[0]?.content?.parts?.map(p => p.text).join("\n") || "";

    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ result: rawText || "No response generated." }),
    };

  } catch (error) {
    console.error("Lead qualifier error:", error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Gemini API request failed", details: error.message }),
    };
  }
};
