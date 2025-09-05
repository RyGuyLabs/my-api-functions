import fetch from "node-fetch";

export async function handler(event, context) {
  // Handle preflight OPTIONS request for CORS
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
      }
    };
  }

  // Parse incoming JSON safely
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (err) {
    return {
      statusCode: 400,
      headers: {
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({ text: "Invalid JSON body." })
    };
  }

  const { feature, data } = body;

  // Map of prompts
  const promptMap = {
    lead_idea: ({ name, company, purpose }) =>
      `You are a top-tier sales strategist and copywriter. Create a highly polished, professional, and persuasive sales idea tailored specifically for ${name} at ${company}. Make it memorable, confident, punchy, and motivational. Integrate the purpose of contact: "${purpose}" naturally into the messaging. Write in a personable and exemplary tone, as if this is a premium communication that will inspire trust and excitement.`,

    nurturing_note: ({ name, company, purpose }) =>
      `You are an elite business communicator and copywriter. Write a highly professional, warm, and memorable nurturing note for ${name} at ${company}. Ensure it feels personally tailored, persuasive, confident, and inspiring. Integrate the purpose of contact: "${purpose}" naturally. The note should be motivational, resonate deeply, and leave a lasting positive impression.`
  };

  if (!promptMap[feature]) {
    return {
      statusCode: 400,
      headers: {
        "Access-Control-Allow-Origin": "*"
      },
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
        max_tokens: 400,
        temperature: 0.75
      })
    });

    const json = await response.json().catch(() => ({ text: "Error generating response." }));

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
      },
      body: JSON.stringify({ text: json.text || "No response from API." })
    };
  } catch (e) {
    console.error(e);
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
      },
      body: JSON.stringify({ text: "Server error: " + e.message })
    };
  }
}
