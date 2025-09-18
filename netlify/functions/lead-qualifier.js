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

    // --- Generate content using Gemini API ---
    const prompt = `
You are a top-tier sales consultant. Using the lead info below, generate a JSON report with keys:
report, predictive, outreach, questions, news.

Lead Details:
${JSON.stringify(leadData, null, 2)}
`;

    const response = await genAI.generateText({
      model: "gemini-1.5", // ✅ valid model
      prompt,
      temperature: 0.7,
      maxOutputTokens: 500,
    });

    // response.output_text contains the generated string
    let parsed;
    try {
      parsed = JSON.parse(response.output_text);
    } catch (err) {
      // fallback if AI returns unparseable JSON
      parsed = {
        report: `<p>${response.output_text}</p>`,
        predictive: "<p>No predictive insights.</p>",
        outreach: "<p>No outreach generated.</p>",
        questions: "<p>No questions generated.</p>",
        news: "<p>No news available.</p>",
      };
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
      body: JSON.stringify({ error: "Gemini API request failed", details: error.message }),
    };
  }
};
