export async function handler(event) {
  try {
    // ----------------------------
    // CORS
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
    // Parse request
    // ----------------------------
    const body = JSON.parse(event.body || "{}");
    const { target, context } = body;

    console.log("Incoming Query:", {
      target,
      context,
      time: new Date().toISOString()
    });

    if (!target || !context) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing target or context" })
      };
    }

    // ----------------------------
    // API Key
    // ----------------------------
    const apiKey = process.env.FIRST_API_KEY;
    if (!apiKey) throw new Error("Missing RYGUY_API_KEY");

    // ----------------------------
    // Prompt (STRICT JSON)
    // ----------------------------
    const prompt = `
You are a sales intelligence engine.

Return ONLY valid JSON.
No markdown. No backticks. No commentary.

Target audience:
"${target}"

Context:
"${context}"

Return EXACTLY this structure:

{
  "coreProblem": string,
  "emotionalTrigger": string,
  "keyInsight": string,
  "recommendedAngle": string,
  "exampleMessaging": string
}
`;

    // ----------------------------
    // Gemini API Call (CORRECT)
    // ----------------------------
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 512
          }
        })
      }
    );

    const raw = await response.json();

    if (!raw.candidates?.[0]?.content?.parts?.[0]?.text) {
      throw new Error("Invalid Gemini response");
    }

    // ----------------------------
    // Clean + Parse
    // ----------------------------
    let text = raw.candidates[0].content.parts[0].text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const parsed = JSON.parse(text);

    // ----------------------------
    // Success
    // ----------------------------
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({ success: true, data: parsed })
    };

  } catch (err) {
    console.error("Backend Error:", err);

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        error: "Execution failed",
        message: err.message
      })
    };
  }
}
