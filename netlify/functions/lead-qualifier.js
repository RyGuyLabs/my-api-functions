// File: netlify/functions/lead-qualifier.js
const { GoogleGenerativeAI } = require("@google/generative-ai");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const geminiApiKey = process.env.FIRST_API_KEY;

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  if (!geminiApiKey) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: "Missing Gemini API key",
        message: "Please set the FIRST_API_KEY environment variable in Netlify",
      }),
    };
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
        body: JSON.stringify({ error: "Missing leadData in request body" }),
      };
    }

    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5", // latest supported
    });

    const conversation = model.startChat({ history: [] });

    const result = await conversation.sendMessage([
      {
        role: "user",
        parts: [
          {
            text: `You are a top-tier sales consultant. Using the lead info below, generate a JSON report with keys: report, predictive, outreach, questions, news.

Lead Details:
${JSON.stringify(leadData, null, 2)}`
          }
        ],
      },
    ]);

    // Robust parsing
    let candidate = result.response.candidates?.[0];
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
      console.warn("Could not parse Gemini response as JSON:", rawText);
      parsed = {
        report: `<p>${rawText}</p>`,
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
