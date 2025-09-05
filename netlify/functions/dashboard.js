import fetch from "node-fetch";

export async function handler(event, context) {
  // Handle CORS preflight requests
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "https://www.ryguylabs.com",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
      },
      body: ""
    };
  }

  const { feature, data } = JSON.parse(event.body || "{}");

  // Use a switch statement for cleaner handling of different features
  const promptMap = {
    // Corrected to match your Squarespace code's feature name
    lead_idea: ({ name, company, purpose, formOfContact }) => `
You are a master sales copywriter and strategist. Write a detailed, persuasive, and memorable outreach message for ${name} at ${company}.
The message must be delivered in the style of ${formOfContact} (e.g., phone script, LinkedIn DM, cold email, etc.).
The purpose of this outreach is: "${purpose}".

Requirements:
- Open with a strong, attention-grabbing first line tailored to ${name}.
- Be clear, confident, and motivating while staying authentic.
- Highlight value to ${company}, not just what’s being sold.
- Include persuasive language that resonates emotionally and logically.
- Conclude with a natural, compelling next step that encourages engagement.
- Do NOT use placeholders like [insert product] — fill the message in fully as if it’s ready to send.

Make it polished, powerful, and unique — something a top sales rep would be proud to deliver.
`,

    // Corrected to match your Squarespace code's feature name
    nurturing_note: ({ name, company, purpose, formOfContact }) => `
You are a relationship-building expert. Write a thoughtful, kind, and professional nurturing note that could be sent to ${name} at ${company}.
This note should follow up naturally on the outreach regarding "${purpose}" via ${formOfContact}.

Requirements:
- Keep the tone warm, personable, and genuine.
- Express care or insight without being pushy.
- Offer a touch of positivity, inspiration, or value that strengthens rapport.
- End with an inviting, open-ended sentiment that leaves the door open for future conversation.

Make it memorable and uplifting — the kind of note that makes ${name} feel respected, valued, and glad they heard from you.
`,

    // New feature: Daily Inspiration
    daily_inspiration: () => `
You are a motivational coach. Provide a short, actionable, and inspiring message to help a user start their workday with confidence.
`,

    // New feature: Breakdown Goals
    breakdown_goals: ({ bigGoal }) => `
You are an expert project manager. Take this large goal: "${bigGoal}" and break it down into 5-7 clear, actionable, and measurable steps. The steps should be practical and easy to follow.
`,

    // New feature: Summarize Goals
    summarize_goals: ({ morningGoals, afternoonGoals, eveningGoals }) => `
You are a productivity expert. Summarize the following daily goals into a single, concise, and motivating paragraph.
Morning Goals: ${morningGoals}
Afternoon Goals: ${afternoonGoals}
Evening Goals: ${eveningGoals}
`,

    // New feature: Morning Briefing (This will be more complex)
    morning_briefing: ({ leads }) => {
      // You can add logic here to generate a briefing based on the leads array
      if (!leads || leads.length === 0) {
        return "You have no leads to brief on today. Get out there and find some!";
      }
      const leadsText = leads.map(lead => `- ${lead.name} at ${lead.company} (Status: ${lead.status})`).join("\n");
      return `
You are a strategic business advisor. Provide a morning briefing based on the following leads:
${leadsText}

Your briefing should include:
- The lead(s) with the highest potential.
- A recommended next step for each of the top leads.
- A general motivational message for the day.
`;
    }
  };

  if (!promptMap[feature]) {
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "https://www.ryguylabs.com" },
      body: JSON.stringify({ text: `Unknown feature: ${feature}` })
    };
  }

  try {
    const apiPrompt = promptMap[feature](data);

    // Correct the API endpoint here
    const response = await fetch("YOUR_CORRECT_GEMINI_API_ENDPOINT_HERE", {
      method: "POST",
      headers: {
        // Ensure your API key is correctly and securely referenced
        "Authorization": `Bearer ${process.env.GEMINI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt: apiPrompt,
        max_tokens: 600,
        temperature: 0.9
      })
    });

    const json = await response.json().catch(() => ({}));

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "https://www.ryguylabs.com",
        "Access-Control-Allow-Headers": "Content-Type"
      },
      body: JSON.stringify({
        text: json.text || "No response received from AI."
      })
    };
  } catch (e) {
    console.error("Server error:", e);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "https://www.ryguylabs.com" },
      body: JSON.stringify({ text: "Server error: " + e.message })
    };
  }
}
