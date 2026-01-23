import fetch from "node-fetch";

export async function handler(event) {
  try {
    // ----------------------------
    // CORS preflight
    // ----------------------------
    if (event.httpMethod === "OPTIONS") {
      return {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Methods": "POST, OPTIONS"
        }
      };
    }

    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    // ----------------------------
    // Parse request body
    // ----------------------------
    const body = JSON.parse(event.body || "{}");
    const { target, context } = body;

    console.log("Incoming Query:", { target, context, time: new Date().toISOString() });

    if (!target || !context) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing target or context" })
      };
    }

    // ----------------------------
    // Environment Variable
    // ----------------------------
    const apiKey = process.env.FIRST_API_KEY;
    if (!apiKey) throw new Error("Missing FIRST_API_KEY");

    // ----------------------------
    // Choose a supported Gemini model
    // ----------------------------
    const MODEL_NAME = "gemini-1.5-turbo";

    // ----------------------------
    // Build prompt
    // ----------------------------
    const prompt = `
You are a sales intelligence engine.

Return ONLY valid JSON. No markdown. No commentary.

Target audience:
"${target}"

Context:
"${context}"

Return this exact structure:

{
  "coreProblem": string,
  "emotionalTrigger": string,
  "keyInsight": string,
  "recommendedAngle": string,
  "exampleMessaging": string
}
`;

    // ----------------------------
    // Make Gemini API call
    // ----------------------------
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 512 }
        })
      }
    );

    const raw = await response.json();
    console.log("Raw Gemini Response:", raw);

    // ----------------------------
    // Validate response
    // ----------------------------
    if (!raw.candidates || !raw.candidates[0]?.content?.parts?.[0]?.text) {
      throw new Error("Gemini returned no candidates");
    }

    let text = raw.candidates[0].content.parts[0].text;

    // Remove any markdown or code fences
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("Invalid Gemini response: Not valid JSON");
    }

    // ----------------------------
    // Return success
    // ----------------------------
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ success: true, data: parsed })
    };

  } catch (err) {
    console.error("Backend Error:", err);

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Execution failed", message: err.message })
    };
  }
}
