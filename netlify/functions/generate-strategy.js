const fetch = require('node-fetch');

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const apiKey = process.env.FIRST_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "API Key missing" })
    };
  }

  try {
    const { target, context } = JSON.parse(event.body);

    const systemPrompt = `
      You are a Strategic Negotiation Agent. 
      Target: ${target}
      Logic: ${context}

      Task:
      1. Identify a real-time pain point for this target using search grounding.
      2. Generate a "No-Oriented" CTA (e.g., "Would it be a bad idea to...").
      3. Provide 3 high-status negotiation rules.

      Return ONLY a JSON object:
      {
        "pain_point": "string",
        "cta": "string",
        "rules": [{"title": "string", "description": "string"}]
      }
    `;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt }] }],
          tools: [{ "google_search": {} }],
          generationConfig: { responseMimeType: "application/json" }
        })
      }
    );

    const rawText = await response.text();
    if (!response.ok) {
      throw new Error(`Gemini API Error: ${response.status} - ${rawText}`);
    }

    const parsed = JSON.parse(rawText);
    const candidate = parsed?.candidates?.[0];
    if (!candidate) throw new Error("No candidates returned from Gemini");

    const combinedText = (candidate.content?.parts || [])
      .map(p => p.text)
      .filter(Boolean)
      .join("\n");

    if (!combinedText) throw new Error("No text returned from Gemini candidate");

    // Extract JSON object from the AI text
    const jsonMatch = combinedText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON object found in Gemini output");

    const finalOutput = JSON.parse(jsonMatch[0]);

    return {
      statusCode: 200,
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*" 
      },
      body: JSON.stringify(finalOutput)
    };

  } catch (error) {
    console.error("Worker Error:", error);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Execution failed", message: error.message })
    };
  }
};
