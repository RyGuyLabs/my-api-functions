// netlify/functions/lead-qualifier.js

import fetch from "node-fetch";

export async function handler(event, context) {
  try {
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Method not allowed" }),
      };
    }

    const { leadData, criteria, includeDemographics } = JSON.parse(event.body);

    // ✅ Gemini API Keys (from your environment variables)
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      return {
        statusCode: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Server misconfiguration: API key not set." }),
      };
    }

    // ✅ Construct the AI prompt
    const prompt = `
Lead Data: ${JSON.stringify(leadData)}
Custom Criteria: ${JSON.stringify(criteria)}
Include Demographics: ${includeDemographics}

Task:
1. Provide a detailed qualification report tailored to this lead.
2. Generate a relevant news snippet for the lead's company or industry.
3. Predict engagement likelihood based on budget, timeline, and industry.
4. Suggest a personalized outreach message.
5. Provide 4-5 numbered Strategic Discovery Questions to guide conversation.

Format your answer using these exact headings:
Qualification Report:
News Snippet:
Predictive Insights:
Outreach Message:
Strategic Discovery Questions:
`;

    // ✅ Call Gemini API
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=" +
        GEMINI_API_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API Error: ${response.statusText}`);
    }

    const data = await response.json();
    const content =
      data.candidates?.[0]?.content?.parts?.[0]?.text || "No content generated.";

    // ✅ Parse sections by headings
    const sections = {};
    content.split(/\n(?=[A-Z][A-Za-z ]+:)/).forEach((line) => {
      const match = line.match(/^([A-Z][A-Za-z ]+):\s*([\s\S]*)$/);
      if (match) {
        sections[match[1].toLowerCase().replace(/\s/g, "-")] = match[2].trim();
      }
    });

    // ✅ Always include fallback discovery questions
    const fallbackDiscovery = `1. What challenges are you currently facing?\n2. How are you addressing them today?\n3. What goals do you have for this quarter?\n4. What would success look like if we worked together?\n5. Who else is involved in making this decision?`;

    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        report: sections["qualification-report"] || content,
        news: sections["news-snippet"] || "No relevant news snippet found.",
        predictiveInsight:
          sections["predictive-insights"] || "No predictive insight generated.",
        outreachMessage:
          sections["outreach-message"] || "No outreach message generated.",
        discoveryQuestions:
          sections["strategic-discovery-questions"] || fallbackDiscovery,
      }),
    };
  } catch (error) {
    console.error("Unexpected server error:", error);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Unexpected server error." }),
    };
  }
}
