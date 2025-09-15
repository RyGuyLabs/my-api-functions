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
    
    // --- DEBUGGING LOGS START ---
    console.log("Received lead data:", leadData);
    console.log("Include demographics:", includeDemographics);
    // --- DEBUGGING LOGS END ---

    if (!leadData) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Lead data is required." }) };
    }

    // --- Gemini API Call ---
    const geminiPrompt = `
You are a Senior Sales Intelligence Analyst with 15 years of experience at a top-tier consulting firm. Your role is to provide strategic, actionable insights to a B2B sales team. Your analysis must be data-driven and focused on identifying opportunities and risks.

Your mission is to synthesize the following lead data into a comprehensive report that goes beyond simple qualification. Do not just restate the data. Analyze and interpret it to uncover underlying trends, potential pain points, and strategic opportunities. Focus on providing a clear "So What?" for the sales representative, explaining why each insight is important and how to act on it.

Respond in plain text exactly in this format:

### Qualification Report
[Provide a detailed situational analysis of the lead's company. Include a high-level summary of their industry position, recent market activity, and inferred pain points. Based on the provided 'leadData', assess the fit against a BANT (Budget, Authority, Need, Timeline) framework. Explicitly state the inferred BANT score (e.g., 'High Need, Medium Authority, Unknown Budget/Timeline').]

### Predictive Engagement
[Generate a predictive engagement score from 1-10, and justify it with a bulleted list of factors. The score should reflect the likelihood of a positive response and deal closure within 6 months. Key factors should include company's recent news, role of the lead, and market maturity.]

### Suggested Outreach
[Outline a multi-channel outreach strategy. For each channel (e.g., Email, LinkedIn, Phone), suggest a specific, personalized message and the ideal time to send it. The messaging should directly reference a specific piece of data from the lead's profile (e.g., 'Noticed you recently...').]

### Suggested Questions
[Provide 5-7 deeply insightful, open-ended questions designed to uncover unspoken challenges and qualify the lead further. Each question should be tied to a specific section of the qualification report (e.g., 'Given [insight], how is your team currently handling [pain point]?').]

Lead Data: ${JSON.stringify(leadData)}
Include Demographics: ${includeDemographics}
`

Respond fully under each heading.
`;

    const geminiResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.FIRST_API_KEY,
        },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [{ text: geminiPrompt }],
          }],
          // FIX: Move generation parameters into a nested object
          generationConfig: {
            maxOutputTokens: 1500,
            temperature: 0.5,
          }
        }),
      }
    );
    
    const geminiData = await geminiResponse.json();
    let reportText = "No report generated.";
    
    // --- DEBUGGING LOGS START ---
    console.log("Raw Gemini API response:", JSON.stringify(geminiData, null, 2));
    // --- DEBUGGING LOGS END ---

    if (geminiData?.candidates?.length > 0) {
      reportText = geminiData.candidates
        .map(c => c.content?.parts?.map(p => p.text).join("\n"))
        .join("\n") || reportText;
    }
    
    // --- DEBUGGING LOGS START ---
    console.log("Extracted report text:", reportText);
    // --- DEBUGGING LOGS END ---

    // --- Robust Parsing ---
    const sections = { report: "", predictive: "", outreach: "", questions: "" };
    const headingRegex = /###\s*(Qualification Report|Predictive Engagement|Suggested Outreach|Suggested Questions)/gi;
    const matches = [...reportText.matchAll(headingRegex)];

    for (let i = 0; i < matches.length; i++) {
      const heading = matches[i][1].toLowerCase().replace(/\s/g,'');
      const start = matches[i].index + matches[i][0].length;
      const end = (i + 1 < matches.length) ? matches[i + 1].index : reportText.length;
      const content = reportText.slice(start, end).trim();

      if (heading.includes("qualification")) sections.report = content;
      else if (heading.includes("predictive")) sections.predictive = content;
      else if (heading.includes("outreach")) sections.outreach = content;
      else if (heading.includes("questions")) sections.questions = content;
    }

    // --- Google News ---
    let newsSnippet = "";
    if (process.env.RYGUY_SEARCH_API_KEY && process.env.RYGUY_SEARCH_ENGINE_ID) {
      const query = `${leadData["lead-company"]} news`;
      const searchRes = await fetch(
        `https://www.googleapis.com/customsearch/v1?key=${process.env.RYGUY_SEARCH_API_KEY}&cx=${process.env.RYGUY_SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}&num=3`
      );
      const searchData = await searchRes.json();
      if (searchData.items?.length) {
        newsSnippet = searchData.items
          .map(item => `<strong>${item.title}</strong>: ${item.snippet} <a href="${item.link}" target="_blank" class="text-blue-400 underline">Read more</a>`)
          .join("<br><br>");
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        report: sections.report || "No report generated.",
        predictive: sections.predictive || "Predictive engagement insights go here.",
        outreach: sections.outreach || "Suggested outreach strategies go here.",
        questions: sections.questions || "Strategic discovery questions go here.",
        news: newsSnippet,
      }),
    };
    
  } catch (error) {
    console.error("Function error:", error.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};
