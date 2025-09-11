// netlify/functions/lead-qualifier.js
import fetch from 'node-fetch';

export const handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "OPTIONS,POST,GET",
  };

  // Handle preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers };
  }

  try {
    const body = JSON.parse(event.body);
    const { leadData, includeDemographics } = body;

    if (!leadData) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Lead data is required." }) };
    }

    // --- Gemini API Call ---
    const geminiPrompt = `
You are a professional sales analyst. Analyze the following lead data and generate a detailed, structured report. Respond in plain text exactly in the following format:

### Qualification Report
[Provide a detailed, actionable analysis of the lead. Include insights on budget, timeline, company size, industry, and lead needs. If demographics are included, summarize them here.]

### Predictive Engagement
[Provide predictive engagement insights based on the lead's profile. Suggest likelihood of closing, attention signals, and priorities.]

### Suggested Outreach
[Provide recommended outreach strategies for engaging this lead. Include tone, messaging style, and suggested channels.]

### Suggested Questions
[Provide 5–10 strategic discovery questions to ask the lead during engagement.]

Lead Data: ${JSON.stringify(leadData)}
Include Demographics: ${includeDemographics}

Respond fully under each heading. Do not skip any sections.
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
          maxOutputTokens: 1500,
          temperature: 0.5, // Lower for more deterministic output
        }),
      }
    );

    const geminiData = await geminiResponse.json();
    let reportText = "No report generated.";

    if (geminiData?.candidates && geminiData.candidates.length > 0) {
      const contents = geminiData.candidates.map(c => c.content?.map(p => p.text).join("\n")).join("\n");
      reportText = contents || reportText;
    }

    // --- Parse Gemini sections ---
    const sections = {
      report: "",
      predictive: "",
      outreach: "",
      questions: ""
    };

    const headingRegex = /^###\s*(.+)$/gm;
    let match;
    const lines = reportText.split("\n");
    let currentHeading = null;

    for (let line of lines) {
      const headingMatch = line.match(/^###\s*(.+)$/);
      if (headingMatch) {
        const heading = headingMatch[1].toLowerCase().replace(/\s/g, '');
        if (heading.includes("qualification")) currentHeading = "report";
        else if (heading.includes("predictive")) currentHeading = "predictive";
        else if (heading.includes("outreach")) currentHeading = "outreach";
        else if (heading.includes("questions")) currentHeading = "questions";
      } else if (currentHeading) {
        sections[currentHeading] += line + "\n";
      }
    }

    // --- Google Search News Snippet (unchanged) ---
    let newsSnippet = "";
    if (process.env.RYGUY_SEARCH_API_KEY && process.env.RYGUY_SEARCH_ENGINE_ID) {
      const query = `${leadData["lead-company"]} news`;
      const searchRes = await fetch(
        `https://www.googleapis.com/customsearch/v1?key=${process.env.RYGUY_SEARCH_API_KEY}&cx=${process.env.RYGUY_SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}&num=3`,
        { method: "GET" }
      );
      const searchData = await searchRes.json();
      if (searchData.items && searchData.items.length > 0) {
        newsSnippet = searchData.items.map(item =>
          `<strong>${item.title}</strong>: ${item.snippet} <a href="${item.link}" target="_blank" class="text-blue-400 underline">Read more</a>`
        ).join("<br><br>");
      }
    }

    // --- Construct Output ---
    const output = {
      report: sections.report || "No report generated.",
      news: newsSnippet,
      predictive: sections.predictive || "Predictive engagement insights go here.",
      outreach: sections.outreach || "Suggested outreach strategies go here.",
      questions: sections.questions || "Strategic discovery questions go here.",
    };

    return { statusCode: 200, headers, body: JSON.stringify(output) };

  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};
