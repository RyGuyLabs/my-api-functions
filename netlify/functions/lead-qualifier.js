// File: netlify/functions/lead-qualifier.js
import { GoogleGenerativeAI } from "@google/generative-ai";

const geminiApiKey = process.env.FIRST_API_KEY;
const searchApiKey = process.env.RYGUY_SEARCH_API_KEY;
const searchEngineId = process.env.RYGUY_SEARCH_ENGINE_ID;

const genAI = new GoogleGenerativeAI(geminiApiKey);

async function googleSearch(query) {
  const url = `https://www.googleapis.com/customsearch/v1?key=${searchApiKey}&cx=${searchEngineId}&q=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google Search failed: ${res.status}`);
  const data = await res.json();

  if (!data.items || data.items.length === 0) return "No results found.";

  return data.items
    .map((item) => `<p><strong>${item.title}</strong><br>${item.snippet}<br><a href="${item.link}" target="_blank">${item.link}</a></p>`)
    .join("\n");
}

export default async function handler(req, res) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (req.method === "OPTIONS") {
    return res.status(200).send("OK");
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed", headers });

  const { leadData, idealClient } = req.body || {};
  if (!leadData) return res.status(400).json({ error: "Missing leadData", headers });

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const chat = model.startChat();

    const prompt = `
      You are a top-tier sales consultant. Using the lead and ideal client info below, generate a professional sales report in JSON with keys: report, predictive, outreach, questions, news.

      Lead Details:
      ${JSON.stringify(leadData, null, 2)}

      Ideal Client Profile:
      ${JSON.stringify(idealClient || {}, null, 2)}

      If you need recent info, indicate a search query like: SEARCH: [query]
    `;

    const initial = await chat.sendMessage(prompt);
    let rawText = initial.response.text();

    // Check for inline "SEARCH: [query]" pattern
    const searchMatch = rawText.match(/SEARCH:\s*\[(.+?)\]/i);
    if (searchMatch) {
      const query = searchMatch[1];
      const results = await googleSearch(query);

      // Feed back search results
      const followup = await chat.sendMessage(`Here are the search results:\n${results}\nPlease update your JSON report.`);
      rawText = followup.response.text();
    }

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = {
        report: `<p>${rawText}</p>`,
        predictive: "<p>No predictive insights.</p>",
        outreach: "<p>No outreach generated.</p>",
        questions: "<p>No questions generated.</p>",
        news: "<p>No news available.</p>",
      };
    }

    return res.status(200).json({
      ...parsed,
      report: parsed.report || "<p>No report generated.</p>",
      predictive: parsed.predictive || "<p>No predictive insights.</p>",
      outreach: parsed.outreach || "<p>No outreach suggestions.</p>",
      questions: parsed.questions || "<p>No questions generated.</p>",
      news: parsed.news || "<p>No news available.</p>",
    });
  } catch (err) {
    console.error("Lead qualifier error:", err);
    return res.status(500).json({ error: err.message || err, headers });
  }
}
