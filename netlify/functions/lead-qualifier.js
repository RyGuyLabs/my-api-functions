// netlify/functions/lead-qualifier.js
import fetch from "node-fetch";

export async function handler(event) {
  const headers = {
    "Access-Control-Allow-Origin": "https://www.ryguylabs.com",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "Preflight OK" };
  }

  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, headers, body: JSON.stringify({ error: "Method Not Allowed" }) };
    }

    const { leadData, customCriteria, includeDemographics } = JSON.parse(event.body);

    const GEMINI_API_KEY = process.env.FIRST_API_KEY;
    const GOOGLE_API_KEY = process.env.RYGUY_SEARCH_API_KEY;
    const SEARCH_ENGINE_ID = process.env.RYGUY_SEARCH_ENGINE_ID;

    if (!GEMINI_API_KEY || !GOOGLE_API_KEY || !SEARCH_ENGINE_ID) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: "Missing environment variables. Ensure FIRST_API_KEY, RYGUY_SEARCH_API_KEY, and RYGUY_SEARCH_ENGINE_ID are set.",
        }),
      };
    }

    // --- Google News Fetch ---
    let newsSnippet = "No relevant news found.";
    try {
      const searchUrl = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(
        leadData["lead-company"] || "latest business news"
      )}&cx=${SEARCH_ENGINE_ID}&key=${GOOGLE_API_KEY}`;

      const searchRes = await fetch(searchUrl);
      const searchJson = await searchRes.json();

      if (searchJson.error) {
        throw new Error(`Google Search API error: ${JSON.stringify(searchJson.error)}`);
      }

      if (searchJson.items && searchJson.items.length > 0) {
        newsSnippet = `${searchJson.items[0].title}: ${searchJson.items[0].snippet} (Source: ${searchJson.items[0].link})`;
      }
    } catch (err) {
      console.error("Google Search failed:", err);
      newsSnippet = "Google Search failed: " + err.message;
    }

    // --- Gemini Call ---
    const prompt = `
Analyze the following lead data against my custom criteria.

Lead Data:
${JSON.stringify(leadData, null, 2)}

My Custom Criteria:
${JSON.stringify(customCriteria, null, 2)}

Latest News Snippet:
${newsSnippet}

Include Demographic Insights: ${includeDemographics}

Please also generate **Strategic Discovery Questions** tailored to this lead.
`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );

    const geminiJson = await geminiRes.json();

    if (geminiJson.error) {
      throw new Error(`Gemini API error: ${JSON.stringify(geminiJson.error)}`);
    }

    const aiResponse =
      geminiJson.candidates?.[0]?.content?.parts?.[0]?.text || "No meaningful response generated.";

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        report: aiResponse,
        news: newsSnippet,
        predictive: "Predictive engagement insights go here.",
        outreach: "Suggested outreach strategies go here.",
        questions: "Strategic discovery questions go here.",
      }),
    };
  } catch (error) {
    console.error("Function crashed:", error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
}
