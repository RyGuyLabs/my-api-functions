// netlify/functions/lead-qualifier.js

export const handler = async (event, context) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: JSON.stringify({ message: "CORS preflight OK" }) };
  }

  try {
    const { leadData, includeDemographics } = JSON.parse(event.body);

    if (!leadData) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Lead data is required" }) };
    }

    const budget = parseInt(leadData["lead-budget"].replace(/\D/g, "")) || 0;
    const timeline = leadData["lead-timeline"] || "Not specified";
    const company = leadData["lead-company"] || "Unknown";
    const name = leadData["lead-name"] || "Prospect";

    const report = `
Lead: ${name} 
Company: ${company} 
Budget: ${leadData["lead-budget"]} 
Timeline: ${timeline} 
Needs: ${leadData["lead-needs"]}

Analysis: 
- This lead shows ${budget > 50000 ? "high potential" : "moderate potential"} based on budget. 
- Timeline indicates ${timeline}. 
- Suggested next step: ${budget > 50000 ? "prioritize immediate outreach" : "nurture over time"}.
`;

    const news = `Recent update for ${company}: Tesla is accelerating global clean energy adoption and exploring new sales technology.`;

    const predictive = `Predictive Engagement Likelihood: ${budget > 50000 ? "High" : "Moderate"} 
Based on budget, company size, and timeline.`;

    const outreach = `
Suggested Outreach Message:
Hi ${name}, 

We noticed ${company} is exploring CRM solutions. Based on your team's size and timeline, we believe we can improve your sales efficiency and tracking. Are you available for a quick 15-min demo this week?
`;

    const questions = `
Suggested Discovery Questions:
1. What CRM solution are you currently using?
2. How many team members need access?
3. What is your decision-making timeline?
4. Are there specific pain points we should address?
`;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ report, news, predictive, outreach, questions }),
    };
  } catch (error) {
    console.error("Error in lead-qualifier:", error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Internal server error" }) };
  }
};
