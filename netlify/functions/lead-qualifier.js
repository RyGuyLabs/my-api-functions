// File: netlify/functions/lead-qualifier.js
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fetch = require("node-fetch");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const geminiApiKey = process.env.FIRST_API_KEY;
const genAI = new GoogleGenerativeAI(geminiApiKey);

async function googleSearch(query) {
  const searchApiKey = process.env.RYGUY_SEARCH_API_KEY;
  const searchEngineId = process.env.RYGUY_SEARCH_ENGINE_ID;
  const url = `https://www.googleapis.com/customsearch/v1?key=${searchApiKey}&cx=${searchEngineId}&q=${encodeURIComponent(query)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Google Search failed: ${response.status}`);
  const data = await response.json();
  if (!data.items || !data.items.length) return "No results found.";
  return data.items.map(item => `<p><strong>${item.title}</strong><br>${item.snippet}<br><a href="${item.link}" target="_blank">${item.link}</a></p>`).join("\n");
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  try {
    const { leadData, idealClient } = JSON.parse(event.body);
    if (!leadData) return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "Missing leadData" }) };

    const model = genAI.getGenerativeModel({
      model: "gemini-1.5",
      tools: [{
        functionDeclarations: [{
          name: "googleSearch",
          description: "Search Google for up-to-date lead or industry information.",
          parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
        }]
      }]
    });

    let conversation = model.startChat({ history: [] });

    let result = await conversation.sendMessage([{
      role: "user",
      content: [{
        text: `Generate a professional sales report in JSON format. Lead Data: ${JSON.stringify(leadData)}, Ideal Client: ${JSON.stringify(idealClient || {})}. Use googleSearch if needed.`
      }]
    }]);

    let response = await result.response;
    let textResponse = "";

    if (response?.candidates?.[0]?.content?.length) {
      for (const part of response.candidates[0].content) {
        if (part.text) textResponse += part.text + "\n";
        if (part.functionCall) {
          const searchResults = await googleSearch(part.functionCall.args.query);
          const followup = await conversation.sendMessage([{
            role: "function",
            content: [{ functionResponse: { name: "googleSearch", response: { output: searchResults } } }]
          }]);
          textResponse = followup.response?.candidates?.[0]?.content?.map(p => p.text).join("\n") || "";
        }
      }
    }

    let parsed;
    try { parsed = JSON.parse(textResponse.trim()); } 
    catch { parsed = { report: textResponse, predictive: "", outreach: "", questions: "", news: "" }; }

    return { statusCode: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, body: JSON.stringify(parsed) };
  } catch (error) {
    console.error("Lead qualifier error:", error);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: "Gemini API request failed", details: error.message }) };
  }
};
