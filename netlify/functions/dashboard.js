// This is the main handler for your Netlify function.
export async function handler(event, context) {
  // Handle CORS preflight requests
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "https://www.ryguylabs.com",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: "",
    };
  }

  // Parse the incoming request body
  const { feature, data } = JSON.parse(event.body || "{}");

  // This object maps the 'feature' name from Squarespace to the correct AI prompt
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
You are a motivational coach. Provide a short, actionable, and inspiring message to help a user start their workday with confidence. Your response MUST end with the exact phrase: "You Got This with RyGuyLabs".
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

    // New feature: Morning Briefing (This is a placeholder, as the front-end code to send leads is missing)
    morning_briefing: ({ leads }) => {
      if (!leads || leads.length === 0) {
        return "You have no leads to brief on today. Get out there and find some!";
      }
      const leadsText = leads
        .map((lead) => `- ${lead.name} at ${lead.company} (Status: ${lead.status})`)
        .join("\n");
      return `
You are a strategic business advisor. Provide a morning briefing based on the following leads:
${leadsText}

Your briefing should include:
- The lead(s) with the highest potential.
- A recommended next step for each of the top leads.
- A general motivational message for the day.
`;
    },
  };

  // Check if the requested feature exists in our map
  if (!promptMap[feature]) {
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "https://www.ryguylabs.com" },
      body: JSON.stringify({ text: `Unknown feature: ${feature}` }),
    };
  }

  try {
    const apiPrompt = promptMap[feature](data);

    // Use native `fetch` which is available in Netlify's Node.js environment
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${process.env.FIRST_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: apiPrompt,
                },
              ],
            },
          ],
          generationConfig: {
            maxOutputTokens: 600,
            temperature: 0.9,
          },
        }),
      }
    );

    // Check for a successful response from the Gemini API
    if (!response.ok) {
      const errorData = await response.text();
      console.error("Gemini API Error:", errorData);
      return {
        statusCode: response.status,
        headers: { "Access-Control-Allow-Origin": "https://www.ryguylabs.com" },
        body: JSON.stringify({ text: `Gemini API Error: ${errorData}` }),
      };
    }

    const json = await response.json();

    // Extract the text from the API response
    const aiText = json?.candidates?.[0]?.content?.parts?.[0]?.text;

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "https://www.ryguylabs.com",
        "Access-Control-Allow-Headers": "Content-Type",
      },
      body: JSON.stringify({
        text: aiText || "No response received from AI.",
      }),
    };
  } catch (e) {
    console.error("Server error:", e);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "https://www.ryguylabs.com" },
      body: JSON.stringify({ text: "Server error: " + e.message }),
    };
  }
}
