// dashboard.js
// Netlify serverless function for handling feature generation with better prompts

import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*"); // CORS enabled
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { feature, data } = req.body;

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
      return res.status(400).json({ error: "Invalid feature" });
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

    res.status(200).json({ result: output });
  } catch (error) {
    console.error("Error in dashboard.js:", error);
    res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
}
