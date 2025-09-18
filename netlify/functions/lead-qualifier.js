// File: netlify/functions/lead-qualifier.js
const { GoogleGenerativeAI } = require("@google/generative-ai");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

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

    // ✅ Initialize API client with your environment variable
    const genAI = new GoogleGenerativeAI(process.env.FIRST_API_KEY);

    // ✅ Use the updated model name
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-pro",
      tools: [
        {
          functionDeclarations: [
            {
              name: "googleSearch",
              description: "Search Google for up-to-date lead or industry information.",
              parameters: {
                type: "object",
                properties: {
                  query: { type: "string", description: "The search query" },
                },
                required: ["query"],
              },
            },
          ],
        },
      ],
    });

    // ✅ Make a basic test call to Gemini
    const result = await model.generateContent([
      `Qualify this lead: ${JSON.stringify(leadData)}`,
    ]);

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ result: result.response.text() }),
    };

  } catch (err) {
    console.error("Lead qualifier error:", err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Failed to generate lead report." }),
    };
  }
};
