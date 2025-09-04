// /netlify/functions/dashboard.js
import fetch from "node-fetch";

export async function handler(event, context) {
  try {
    const API_KEY = process.env.FIRST_API_KEY;
    if (!API_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Missing FIRST_API_KEY in environment variables" }),
      };
    }

    // Check for a "type" parameter (decides what the function does)
    const params = event.queryStringParameters;
    const type = params.type || "leads";

    // === BRANCH 1: Fetch Leads ===
    if (type === "leads") {
      const response = await fetch("https://api.first.io/v1/leads", {
        headers: {
          "Authorization": `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        return {
          statusCode: response.status,
          body: JSON.stringify({ error: `API request failed: ${response.statusText}` }),
        };
      }

      const data = await response.json();
      return {
        statusCode: 200,
        body: JSON.stringify({ leads: data }),
      };
    }

    // === BRANCH 2: AI Helper (stub for now) ===
    if (type === "ai") {
      return {
        statusCode: 200,
        body: JSON.stringify({ message: "AI helper endpoint will go here soon." }),
      };
    }

    // Default branch (no valid type provided)
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid type parameter" }),
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
}
