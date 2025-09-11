// Netlify Function: lead-qualifier.js

import fetch from "node-fetch";

export const handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") {
      return {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      };
    }

    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const { leadData, includeDemographics } = JSON.parse(event.body);

    if (!process.env.GEMINI_API_KEY) {
      throw new Error("Server misconfiguration: API key missing.");
    }

    // --- Fetch Latest News ---
    let latestNews = "No news available.";
    if (leadData["lead-company"]) {
      try {
        const searchRes = await fetch(
          `https://serpapi.com/search.json?q=${encodeURIComponent(
            leadData["lead-company"]
          )}+news&api_key=${process.env.SERP_API_KEY}`
        );
        const searchJson = await searchRes.json();
        if (searchJson?.news_results?.length > 0) {
          const topArticle = searchJson.news_results[0];
          latestNews = `${topArticle.title} - ${topArticle.link}`;
        }
      } catch (err) {
        console.error("Error fetching news:", err.message);
      }
    }

    // --- Call Gemini for Analysis ---
    const prompt = `
Analyze the following lead against my custom criteria.

Lead Data:
${JSON.stringify(leadData, null, 2)}

Latest News:
${latestNews}

Include Demographic Insights: ${includeDemographics}

Provide structured output with:
1. Qualification Report
2. Predictive Engagement Insight
3. Suggested Outreach Message
4. Strategic Discovery Questions
    `;

    const geminiRes = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GEMINI_API_KEY}`,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );

    if (!geminiRes.ok) {
      throw new Error(`Gemini API Error: ${await geminiRes.text()}`);
    }

    const geminiJson = await geminiRes.json();
    const aiText =
      geminiJson.candidates?.[0]?.content?.parts?.[0]?.text ||
      "No analysis generated.";

    // --- Parse AI output into structured fields ---
    const reportMatch = aiText.match(/Qualification Report[\s\S]*?(?=Predictive Engagement|$)/i);
    const predictiveMatch = aiText.match(/Predictive Engagement[\s\S]*?(?=Suggested Outreach|$)/i);
    const outreachMatch = aiText.match(/Suggested Outreach[\s\S]*?(?=Strategic Discovery|$)/i);
    const questionsMatch = aiText.match(/Strategic Discovery Questions[\s\S]*/i);

    const responsePayload = {
      report: reportMatch ? reportMatch[0].trim() : "No Report Generated",
      news: latestNews,
      predictiveInsight: predictiveMatch ? predictiveMatch[0].trim() : "No Predictive Engagement Insights",
      outreachMessage: outreachMatch ? outreachMatch[0].trim() : "No Suggested Outreach",
      discoveryQuestions: questionsMatch ? questionsMatch[0].trim() : "No Strategic Discovery Questions",
    };

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(responsePayload),
    };
  } catch (err) {
    console.error("Unexpected server error:", err);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
