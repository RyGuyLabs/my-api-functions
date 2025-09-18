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

    // ✅ Init Gemini client (v1 SDK will point to correct endpoint)
    const genAI = new GoogleGenerativeAI(process.env.FIRST_API_KEY);

    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-turbo", // modern + cheaper than pro
    });

    // ✅ Generate response from Gemini
    const result = await model.generateContent(
      `Qualify this lead: ${JSON.stringify(leadData)}`
    );

    const text = result.response.text();

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ result: text }),
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
