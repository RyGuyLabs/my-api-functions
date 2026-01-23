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
    // Gemini API
    // ----------------------------
    const apiKey = process.env.FIRST_API_KEY;
    if (!apiKey) throw new Error("Missing FIRST_API_KEY");

    const prompt = `
You are a sales intelligence engine.

Return ONLY valid JSON.
No markdown.
No backticks.
No commentary.

Target audience:
"${target}"

Context:
"${context}"

Return this exact structure:

{
  "coreProblem": "string",
  "emotionalTrigger": "string",
  "keyInsight": "string",
  "recommendedAngle": "string",
  "exampleMessaging": "string"
}
`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
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

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(errText);
    }

    const raw = await response.json();

    if (!raw.candidates || !raw.candidates[0]) {
      throw new Error("No candidates returned from Gemini");
    }

    let text = raw.candidates[0].content.parts[0].text.trim();

    // Defensive cleanup (just in case)
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();

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
      body: JSON.stringify(parsed)
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
