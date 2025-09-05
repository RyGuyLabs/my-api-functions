import fetch from "node-fetch";

export async function handler(event, context) {
  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "https://www.ryguylabs.com",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: "",
    };
  }

  let body = {};
  try {
    body = JSON.parse(event.body || "{}");
  } catch (err) {
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "https://www.ryguylabs.com" },
      body: JSON.stringify({ text: "Invalid JSON body." }),
    };
  }

  const { feature, data } = body;

  if (!feature || !data) {
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "https://www.ryguylabs.com" },
      body: JSON.stringify({ text: "Missing feature or data." }),
    };
  }

  // Provide defaults to prevent undefined
  const { name = "Prospect", company = "their company", purpose = "connect", formOfContact = "email" } = data;

  // Map Squarespace feature names to prompt functions
  const promptMap = {
    generateIdea: () => `
You are a master sales strategist and copywriter. Write a detailed, persuasive, memorable, and motivating outreach message for ${name} at ${company}.
The outreach method is ${formOfContact}.
The goal of this contact is: "${purpose}".

Requirements:
- Start with a compelling, personalized hook that captures ${name}'s attention.
- Communicate value clearly and confidently, focusing on benefits to ${company}.
- Include emotionally resonant and logically persuasive language.
- Conclude with a clear, natural next step encouraging engagement.
- The message should be polished, professional, and ready to send as-is.
`,

    generateNurturingNote: () => `
You are a relationship-building expert. Write a warm, kind, and professional follow-up note for ${name} at ${company}.
The note should reflect on "${purpose}" and be suitable for sending via ${formOfContact}.

Requirements:
- Maintain a personable, genuine tone without being pushy.
- Offer positivity, insight, or value that strengthens rapport.
- Conclude with an inviting sentiment that encourages ongoing conversation.
- Make it memorable, polished, and uplifting.
`,
  };

  if (!promptMap[feature]) {
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "https://www.ryguylabs.com" },
      body: JSON.stringify({ text: `Unknown feature: ${feature}` }),
    };
  }

  try {
    const response = await fetch("https://api.gemini.com/v1/generate", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.FIRST_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: promptMap[feature](),
        max_tokens: 700,
        temperature: 0.9,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        statusCode: response.status,
        headers: { "Access-Control-Allow-Origin": "https://www.ryguylabs.com" },
        body: JSON.stringify({ text: `AI API error: ${text}` }),
      };
    }

    const json = await response.json();
    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "https://www.ryguylabs.com" },
      body: JSON.stringify({ text: json.text || "No response from AI." }),
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
