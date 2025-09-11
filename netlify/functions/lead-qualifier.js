// netlify/functions/lead-qualifier.js

import fetch from "node-fetch";

export async function handler(event) {
  // Always include CORS headers
  const headers = {
    "Access-Control-Allow-Origin": "https://www.ryguylabs.com", // allow your Squarespace site
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  // Handle preflight OPTIONS request
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: "Preflight check passed.",
    };
  }

  try {
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        headers,
        body: JSON.stringify({ error: "Method Not Allowed" }),
      };
    }

    const { leadData, customCriteria, includeDemographics } = JSON.parse(event.body);

    const GEMINI_API_KEY = process.env.FIRST_API_KEY;
    const GOOGLE_API_KEY = process.env.RYGUY_SEARCH_API_KEY;
    const CSE_ID = process.env.RYGUY_CSE_ID;

    if (!GEMINI_API_KEY || !GOOGLE_API_KEY || !CSE_ID) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: "Server misconfiguration: API keys or CSE ID not set." }),
      };
    }

    // 1. Fetch latest news snippet
    let newsSnippet = "No relevant news found.";
    try {
      const searchUrl = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(
        leadData["lead-company"]
      )}&cx=${CSE_ID}&key=${GOOGLE_API_KEY}`;
      const searchRes = await fetch(searchUrl);
      const searchJson = await searchRes.json();

      if (searchJson.items && searchJson.items.length > 0) {
        newsSnippet = `${searchJson.items[0].title}: ${searchJson.items[0].snippet} (Source: ${searchJson.items[0].link})`;
      }
    } catch (err) {
      console.error("Error fetching news snippet:", err);
    }

    // 2. Build Gemini prompt
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

    // 3. Call Gemini API
    const geminiRes = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + GEMINI_API_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );

    if (!geminiRes.ok) {
      const errorText = await geminiRes.text();
      throw new Error(`Gemini API error: ${errorText}`);
    }

    const geminiJson = await geminiRes.json();
    const aiResponse =
      geminiJson.candidates?.[0]?.content?.parts?.[0]?.text ||
      "No meaningful response generated.";

    // 4. Return response with CORS headers
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        analysis: aiResponse,
        newsSnippet,
      }),
    };
  } catch (error) {
    console.error("Unexpected server error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || "Unexpected error occurred." }),
    };
  }
}
