// netlify/functions/lead-qualifier.js

export const handler = async (event, context) => {
  // Enable CORS for your Squarespace frontend
  const headers = {
    "Access-Control-Allow-Origin": "*", // Or restrict to your domain
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: "CORS preflight OK" }),
    };
  }

  try {
    const { leadData, criteria, includeDemographics } = JSON.parse(event.body);

    if (!leadData) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Lead data is required" }),
      };
    }

    // --- Simulated AI qualification logic ---
    // Replace this section with your actual AI call if needed
    const budgetScore = leadData["lead-budget"]
      ? parseInt(leadData["lead-budget"].replace(/\D/g, "")) || 0
      : 0;

    const report = `Lead ${leadData["lead-name"]} from ${
      leadData["lead-company"]
    } has a budget of ${leadData["lead-budget"]} and timeline ${
      leadData["lead-timeline"]
    }. Based on your criteria, this lead is ${
      budgetScore > 50000 ? "High Priority" : "Medium/Low Priority"
    }.`;

    const news = `Latest news about ${leadData["lead-company"]}: Tesla is accelerating global clean energy adoption.`;

    const predictive = `Predicted engagement likelihood: ${
      budgetScore > 50000 ? "High" : "Medium"
    }`;

    const outreach = `Hi ${leadData["lead-name"]},\n\nWe noticed your company, ${
      leadData["lead-company"]
    }, is considering new CRM solutions. We'd love to discuss how we can help your sales team perform better.`;

    const questions = `1. Current CRM in use?\n2. Sales team size?\n3. Decision timeline?`;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ report, news, predictive, outreach, questions }),
    };
  } catch (error) {
    console.error("Error in lead-qualifier:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
