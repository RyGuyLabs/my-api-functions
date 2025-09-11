// netlify/functions/lead-qualifier.js
import fetch from 'node-fetch';

export const handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "OPTIONS,POST,GET",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers };
  }

  try {
    const body = JSON.parse(event.body);
    const { leadData, includeDemographics } = body;

    if (!leadData) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Lead data is required." }) };
    }

    // --- Gemini API Call with structured JSON prompt ---
    const geminiResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.FIRST_API_KEY}`,
        },
        body: JSON.stringify({
          prompt: `
You are a professional sales strategist. Analyze the following lead data and respond in strict JSON format with these keys:
- "report": a concise, professional qualification report.
- "predictive": predictive engagement insights.
- "outreach": suggested outreach strategies.
- "questions": strategic discovery questions.

Include demographic insights only if "Include Demographics" is true.

Lead Data: ${JSON.stringify(leadData)}
Include Demographics: ${includeDemographics}

Respond ONLY in valid JSON format.
`,
          maxOutputTokens: 1200,
          temperature: 0.7,
        }),
      }
    );

    const geminiData = await geminiResponse.json();

    let report = "No report generated.";
    let predictive = "Predictive engagement insights go here.";
    let outreach = "Suggested outreach strategies go here.";
    let questions = "Strategic discovery questions go here.";

    if (geminiData?.candidates && geminiData.candidates.length > 0) {
      try {
        const rawText = geminiData.candidates
          .map(c => c.content?.map(p => p.text).join("\n"))
          .join("\n");
        const parsed = JSON.parse(rawText);
        report = parsed.report || report;
        predictive = parsed.predictive || predictive;
        outreach = parsed.outreach || outreach;
        questions = parsed.questions || questions;
      } catch (e) {
        console.error("Error parsing Gemini JSON:", e.message);
      }
    }

    // --- Google Search News Snippet ---
    let newsSnippet = "";
    if (process.env.RYGUY_SEARCH_API_KEY && process.env.RYGUY_SEARCH_ENGINE_ID) {
      const query = `${leadData["lead-company"]} news`;
      const searchRes = await fetch(
        `https://www.googleapis.com/customsearch/v1?key=${process.env.RYGUY_SEARCH_API_KEY}&cx=${process.env.RYGUY_SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}&num=3`,
        { method: "GET" }
      );
      const searchData = await searchRes.json();
      if (searchData.items && searchData.items.length > 0) {
        newsSnippet = searchData.items
          .map(item =>
            `<strong>${item.title}</strong>: ${item.snippet} <a href="${item.link}" target="_blank" class="text-blue-400 underline">Read more</a>`
          )
          .join("<br><br>");
      }
    }

    // --- Construct Output ---
    const output = {
      report,
      news: newsSnippet,
      predictive,
      outreach,
      questions,
    };

    return { statusCode: 200, headers, body: JSON.stringify(output) };

  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};
