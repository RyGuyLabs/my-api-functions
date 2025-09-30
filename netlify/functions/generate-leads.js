// Netlify Serverless Function to securely call the Gemini API
// Handles the API key, validates input, and ranks leads by quality.

const fetch = (...args) =>
  import('node-fetch').then(({ default: fetch }) => fetch(...args));

// Renamed local constant to match the environment variable name for clarity
const LEAD_QUALIFIER_API_KEY = process.env.LEAD_QUALIFIER_API_KEY;
const MODEL_NAME = "gemini-2.5-flash-preview-05-20";

exports.handler = async (event, context) => {
  // Check for API key presence
  if (!LEAD_QUALIFIER_API_KEY) {
    console.error("LEAD_QUALIFIER_API_KEY environment variable is not set.");
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server configuration error: API key missing." }),
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let params;
  try {
    params = JSON.parse(event.body);
  } catch (error) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body provided." }) };
  }

  const { leadType, searchTerm, location, financialTerm } = params;

  // Validate incoming parameters
  if (!leadType || !searchTerm || !location) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: "Missing required parameters (leadType, searchTerm, or location).",
      }),
    };
  }

  // --- Gemini API Configuration ---
  const systemPrompt = `
You are a specialized, top-tier Sales Intelligence Analyst and Lead Generator.
Your goal is to produce leads that are high-quality, validated, and distinctive from common database entries, adding next-level value for the consumer.

You must generate exactly 3 highly qualified leads based on the user's criteria. 
Each lead must include:
1. A verifiable trigger event or signal sourced from search results (e.g., funding round, new leadership, expansion, major financial event).
2. A justification referencing that trigger.
3. A suggested outreach strategy tied directly to that signal.

If a lead cannot be validated by a real-world triggering event, replace it with a stronger one.

For each lead, provide:
- name
- brief description
- realistic or scraped contact information whenever possible (if unavailable, infer the closest domain and provide a role-based email like info@company.com)
- website
- email
- phone number
- QualityScore (High, Medium, Low) based only on the strength and recency of the validation signal
- insights justifying the lead quality
- suggestedAction
- draftPitch tailored to the validation signal
- socialSignal (the specific trigger event found)

Your response must be valid JSON only.
Do not include explanations, commentary, or markdown formatting.
Do not wrap the output in code fences.
Return only a JSON object with a single property: "leads", which is an array of exactly 3 lead objects.
`;

  const userQuery = `Generate 3 leads for a "${leadType}" prospect, matching the search term: "${searchTerm}" in the location: "${location}". 
If the lead type is "residential", also consider the financial term: "${financialTerm}".`;

  // Use the correct, renamed local constant for the API URL
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${LEAD_QUALIFIER_API_KEY}`;

  const payload = {
    contents: [{ parts: [{ text: userQuery }] }],
    tools: [{ google_search: {} }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          leads: {
            type: "ARRAY",
            description: "A list of exactly three generated leads.",
            items: {
              type: "OBJECT",
              properties: {
                name: { type: "STRING" },
                description: { type: "STRING" },
                website: { type: "STRING" },
                email: { type: "STRING" },
                phoneNumber: { type: "STRING" },
                qualityScore: { type: "STRING", enum: ["High", "Medium", "Low"] },
                insights: { type: "STRING" },
                suggestedAction: { type: "STRING" },
                draftPitch: { type: "STRING" },
                socialSignal: { type: "STRING" },
              },
            },
          },
        },
      },
    },
  };

  try {
    // 1. Call Gemini API
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Gemini API HTTP Error: ${response.status}`, errorBody);
      return {
        statusCode: response.status,
        body: JSON.stringify({
          error: "Failed to communicate with the Gemini API.",
          details: errorBody,
        }),
      };
    }

    // 2. Process Response
    const result = await response.json();
    let jsonString = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!jsonString) {
      console.error("Received an empty response from the AI.");
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "AI returned an empty response." }),
      };
    }

    // Clean up markdown wrappers if present
    jsonString = jsonString.replace(/```json|```/g, "").trim();

    let parsedResult;
    try {
      parsedResult = JSON.parse(jsonString);
    } catch (err) {
      console.error("Bad JSON from AI:", jsonString);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "Failed to parse JSON from AI.",
          details: err.message,
        }),
      };
    }

    // Defensive check: Ensure the 'leads' array exists
    if (!parsedResult.leads || !Array.isArray(parsedResult.leads)) {
      console.error("No 'leads' array found:", parsedResult);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "AI response missing 'leads' array." }),
      };
    }

    // 3. Rank leads by value (High > Medium > Low)
    const scoreMap = { High: 3, Medium: 2, Low: 1 };
    const rankedLeads = parsedResult.leads.sort(
      (a, b) => scoreMap[b.qualityScore] - scoreMap[a.qualityScore]
    );

    return {
      statusCode: 200,
      body: JSON.stringify(rankedLeads),
    };
  } catch (error) {
    console.error("Serverless function execution error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Internal Server Error during AI processing.",
        details: error.message,
      }),
    };
  }
};
