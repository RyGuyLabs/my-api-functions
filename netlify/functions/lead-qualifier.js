import fetch from "node-fetch";

const GEMINI_API_KEY = process.env.FIRST_API_KEY;
const GOOGLE_API_KEY = process.env.RYGUY_SEARCH_API_KEY;
const GOOGLE_SEARCH_ENGINE_ID = process.env.RYGUY_SEARCH_ENGINE_ID;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

export async function handler(event, context) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: "OK"
    };
  }

  try {
    const { leadData, includeDemographics } = JSON.parse(event.body);

    if (!leadData) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "Missing lead data" })
      };
    }

    // 1️⃣ Google Programmable Search for news snippet
    let newsSnippet = "";
    try {
      const searchQuery = `${leadData["lead-company"]} latest news`;
      const searchRes = await fetch(
        `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${GOOGLE_SEARCH_ENGINE_ID}&q=${encodeURIComponent(searchQuery)}&num=1`
      );
      const searchData = await searchRes.json();
      if (searchData.items && searchData.items.length > 0) {
        newsSnippet = searchData.items[0].snippet;
      }
    } catch (err) {
      console.error("Error fetching news snippet:", err.message);
    }

    // 2️⃣ Gemini API to generate qualification report
    const geminiRequestBody = {
      prompt: `
      Analyze the following lead data and generate a professional qualification report, including:
      - Breakdown of lead data
      - Relevance to ideal customer profile
      - Insights for outreach
      - Suggested strategic discovery questions
      Include demographic insights: ${includeDemographics ? "Yes" : "No"}
      Lead Data: ${JSON.stringify(leadData)}
      News Snippet: ${newsSnippet}
      `,
      temperature: 0.7,
      max_output_tokens: 600
    };

    let report = "";
    try {
      const geminiRes = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-preview:generateText", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${GEMINI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(geminiRequestBody)
      });
      const geminiData = await geminiRes.json();
      if (geminiData.candidates && geminiData.candidates.length > 0) {
        report = geminiData.candidates[0].content;
      }
    } catch (err) {
      console.error("Error generating report:", err.message);
    }

    // 3️⃣ Build response object
    const responseBody = {
      report: report || "No report generated",
      news: newsSnippet || "",
      predictive: "Predictive engagement insights go here.",
      outreach: "Suggested outreach strategies go here.",
      questions: "Strategic discovery questions go here."
    };

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(responseBody)
    };

  } catch (error) {
    console.error("Unexpected server error:", error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: error.message })
    };
  }
}
