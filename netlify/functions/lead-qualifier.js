// netlify/functions/lead-qualifier.js

import fetch from "node-fetch";

export async function handler(event, context) {
  try {
    // Read API key from environment variable
    const API_KEY = process.env.FIRST_API_KEY;
    if (!API_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Missing API key (FIRST_API_KEY)" }),
      };
    }

    // Parse input (if any) from request body
    let inputText = "Generate a sample lead report.";
    if (event.body) {
      try {
        const body = JSON.parse(event.body);
        if (body.prompt) {
          inputText = body.prompt;
        }
      } catch (e) {
        console.error("Invalid JSON in request body:", e);
      }
    }

    // Call Gemini API (v1beta, flash model)
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: inputText }],
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", errorText);
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: "Gemini API request failed", details: errorText }),
      };
    }

    const data = await response.json();
    console.log("Gemini API raw response:", data);

    // Extract output text safely
    let output = "";
    if (
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts[0].text
    ) {
      output = data.candidates[0].content.parts[0].text;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ result: output }),
    };
  } catch (err) {
    console.error("Lead qualifier error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to generate lead report.", details: err.message }),
    };
  }
}
