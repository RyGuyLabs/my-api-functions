// dashboard.js
// Netlify serverless function for handling feature generation with better prompts

const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.FIRST_API_KEY, // using your FIRST_API_KEY environment variable
});

exports.handler = async function (event, context) {
  // Handle preflight CORS
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { feature, data } = JSON.parse(event.body || "{}");

    let prompt = "";

    // Polished prompts per feature
    if (feature === "lead_idea") {
      prompt = `
You are a professional sales development rep.
Your job is to write a short, personalized **opening idea** for contacting a prospect.
It should be warm, conversational, and reference the prospect by name, company, or their purpose of contact.
Tone: professional but approachable, like a top 10% SDR.

Lead Name: ${data.name || "N/A"}
Company: ${data.company || "N/A"}
Purpose of Contact: ${data.purpose || "N/A"}

Write 2 polished variations (1–2 sentences each) that could be spoken naturally on a sales call.`;
    }

    if (feature === "nurturing_note") {
      prompt = `
You are a sales professional writing a short **relationship-nurturing follow-up note**.
It should be personalized, professional, and lightly value-driven — not generic or spammy.
Mention the lead’s name, company, and purpose of contact. Keep it to 2–3 sentences max.
Tone: thoughtful and consultative.

Lead Name: ${data.name || "N/A"}
Company: ${data.company || "N/A"}
Purpose of Contact: ${data.purpose || "N/A"}

Write 2 polished variations that feel human, build trust, and resonate with the prospect.`;
    }

    if (!prompt) {
      return { statusCode: 400, body: JSON.stringify({ error: "Invalid feature" }) };
    }

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are an expert sales communication coach." },
        { role: "user", content: prompt },
      ],
      max_tokens: 250,
      temperature: 0.8,
    });

    const output = response.choices[0].message.content.trim();

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*", // allow all origins
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ result: output }),
    };
  } catch (error) {
    console.error("Error in dashboard.js:", error);
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ error: "Internal Server Error", details: error.message }),
    };
  }
};
