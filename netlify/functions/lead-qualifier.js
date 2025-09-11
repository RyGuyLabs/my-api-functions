// netlify/functions/lead-qualifier.js
import fetch from 'node-fetch';

export const handler = async (event) => {
  // --- CORS Headers ---
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "OPTIONS,POST,GET",
  };

  // Handle preflight OPTIONS
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers };
  }

  try {
    const body = JSON.parse(event.body);
    const { leadData, includeDemographics } = body;

    if (!leadData) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Lead data is required." }),
      };
    }

    // --- Gemini API Call for Detailed Lead Analysis ---
    const geminiPrompt = `
You are a professional sales strategist.

Analyze the following lead data against the provided criteria (if any), and generate a detailed, actionable, and professional report. Include:
- Lead Analysis
- Demographic Insights (if requested)
- Strategic Discovery Questions
- Suggested Outreach and Predictive Engagement

Lead Data: ${JSON.stringify(leadData)}
Include Demographics: ${includeDemographics}

Ensure your report:
- Uses full sentences and professional tone
- Is specific and insightful
- Clearly addresses the lead's budget, timeline, company, and needs
- Produces subheadings where appropriate
`;

    const geminiResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.FIRST_API_KEY}`,
        },
        body: JSON.stringify({
          prompt: geminiPrompt,
          maxOutputTokens: 1000,
          temperature: 0.7,
        }),
      }
    );

    const geminiData = await geminiResponse.json();
    const report = geminiData?.candidates?.[0]?.content?.[0]?.text || "No report generated.";

    // --- Google Programmable Search API for News Snippet ---
    let newsSnippet = "";
    if (process.env.RYGUY_SEARCH_API_KEY && process.env.RYGUY_SEARCH_ENGINE_ID) {
      const query = `${leadData["lead-company"]} news`;
      const searchRes = await fetch(
        `https://www.googleapis.com/customsearch/v1?key=${process.env.RYGUY_SEARCH_API_KEY}&cx=${process.env.RYGUY_SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}`,
        { method: "GET" }
      );
      const searchData = await searchRes.json();
      newsSnippet = searchData.items?.[0]?.snippet || "No recent news found.";
    }

    // --- Final Structured Output ---
    const output = {
      report,
      news: newsSnippet,
      predictive: "Predictive engagement insights go here.",
      outreach: "Suggested outreach strategies go here.",
      questions: "Strategic discovery questions go here.",
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(output),
    };
  } catch (error) {
    console.error("Lead Qualifier Error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
