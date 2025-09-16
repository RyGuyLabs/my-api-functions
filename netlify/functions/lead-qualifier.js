// netlify/functions/lead-qualifier.js
import fetch from "node-fetch";

export async function handler(event, context) {
  try {
    const { prompt, leadData, idealClient } = JSON.parse(event.body);

    // Replace with your OpenAI API key in Netlify environment variables
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

    // Construct the system + user message
    const messages = [
      {
        role: "system",
        content: "You are a world-class sales consultant. Generate highly professional, resonating, witty, and masterful sales insights."
      },
      {
        role: "user",
        content: prompt
      }
    ];

    // Call OpenAI Chat API
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: messages,
        max_tokens: 1200,
        temperature: 0.8
      })
    });

    const result = await response.json();
    const text = result.choices?.[0]?.message?.content || "No response generated.";

    // Split sections by markers (user can ask AI to format like "### Section Name") or simple heuristic
    const sections = {
      report: text.match(/Qualification Report:(.*?)(?=Predictive Engagement:|$)/s)?.[1]?.trim() || text,
      predictive: text.match(/Predictive Engagement:(.*?)(?=Suggested Outreach:|$)/s)?.[1]?.trim() || "Predictive engagement insights go here.",
      outreach: text.match(/Suggested Outreach:(.*?)(?=Suggested Questions:|$)/s)?.[1]?.trim() || "Suggested outreach strategies go here.",
      questions: text.match(/Suggested Questions:(.*?)(?=News:|$)/s)?.[1]?.trim() || "Strategic discovery questions go here.",
      news: text.match(/News:(.*)/s)?.[1]?.trim() || "No news found."
    };

    // Return HTML-ready content
    const htmlSections = {
      report: `<div>${sections.report.replace(/\n/g, "<br>")}</div>`,
      predictive: `<div>${sections.predictive.replace(/\n/g, "<br>")}</div>`,
      outreach: `<div>${sections.outreach.replace(/\n/g, "<br>")}</div>`,
      questions: `<div>${sections.questions.replace(/\n/g, "<br>")}</div>`,
      news: `<div>${sections.news.replace(/\n/g, "<br>")}</div>`
    };

    return {
      statusCode: 200,
      body: JSON.stringify(htmlSections)
    };

  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server error generating lead report." })
    };
  }
}
