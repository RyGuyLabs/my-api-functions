import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function handler(event, context) {
  // Enable CORS
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  // Handle preflight request
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (err) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { feature, data } = body;

  if (!feature || !data) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing feature or data" }) };
  }

  const { name, company, purpose } = data;

  if (!name || !company || !purpose) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing lead information" }) };
  }

  let prompt;
  if (feature === "lead_idea") {
    prompt = `
You are a top-tier, highly professional sales strategist. Generate a THOROUGH, polished, motivating, and memorable sales idea for a prospect with the following details:
Name: ${name}
Company: ${company}
Purpose: ${purpose}
Output must be actionable, punchy, persuasive, and crafted to maximize engagement with the prospect. Make it detailed, professional, and inspiring.`;
  } else if (feature === "nurturing_note") {
    prompt = `
You are a skilled, friendly sales professional. Generate a SHORT, polite, and engaging nurturing note for a prospect with the following details:
Name: ${name}
Company: ${company}
Purpose: ${purpose}
Keep it professional, warm, and easy to use in a message to the prospect.`;
  } else {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Feature not recognized" }) };
  }

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 400,
    });

    const text = response.choices[0].message.content.trim();

    return { statusCode: 200, headers, body: JSON.stringify({ text }) };
  } catch (err) {
    console.error("OpenAI API error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Failed to generate response", details: err.message }),
    };
  }
}
