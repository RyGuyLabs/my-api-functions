import fetch from "node-fetch";

export async function handler(event, context) {
  const { feature, data } = JSON.parse(event.body || "{}");

  const promptMap = {
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

    nurturing_note: ({ name, company, purpose, formOfContact }) => `
You are a relationship-building expert. Write a thoughtful, kind, and professional nurturing note that could be sent to ${name} at ${company}.
This note should follow up naturally on the outreach regarding "${purpose}" via ${formOfContact}.

Requirements:
- Keep the tone warm, personable, and genuine.
- Express care or insight without being pushy.
- Offer a touch of positivity, inspiration, or value that strengthens rapport.
- End with an inviting, open-ended sentiment that leaves the door open for future conversation.

Make it memorable and uplifting — the kind of note that makes ${name} feel respected, valued, and glad they heard from you.
`
  };

  if (!promptMap[feature]) {
    return {
      statusCode: 400,
      body: JSON.stringify({ text: "Unknown feature." })
    };
  }

  try {
    const response = await fetch("https://api.gemini.com/v1/generate", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.FIRST_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt: promptMap[feature](data),
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
