// File: netlify/functions/lead-qualifier.js
import { GoogleGenerativeAI } from "@google/generative-ai";

// Env vars (provided by you)
const geminiApiKey = process.env.FIRST_API_KEY;
const searchApiKey = process.env.RYGUY_SEARCH_API_KEY;
const searchEngineId = process.env.RYGUY_SEARCH_ENGINE_ID;

// Init Gemini client
const genAI = new GoogleGenerativeAI(geminiApiKey);

// Google Custom Search helper
async function googleSearch(query) {
  const url = `https://www.googleapis.com/customsearch/v1?key=${searchApiKey}&cx=${searchEngineId}&q=${encodeURIComponent(query)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Google Search failed: ${response.status}`);
  const data = await response.json();

  if (!data.items || data.items.length === 0) {
    return "No results found.";
  }

  return data.items
    .map(
      (item) =>
        `<p><strong>${item.title}</strong><br>${item.snippet}<br><a href="${item.link}" target="_blank">${item.link}</a></p>`
    )
    .join("\n");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { leadData, idealClient } = req.body || {};
  if (!leadData) {
    return res.status(400).json({ error: "Missing leadData" });
  }

  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-pro",
      tools: [
        {
          functionDeclarations: [
            {
              name: "googleSearch",
              description: "Search Google for up-to-date lead or industry information.",
              parameters: {
                type: "object",
                properties: {
                  query: {
                    type: "string",
                    description: "The search query",
                  },
                },
                required: ["query"],
              },
            },
          ],
        },
      ],
    });

    let conversation = await model.startChat({ history: [] });

    // Step 1: Initial request
    let result = await conversation.sendMessage([
      {
        role: "user",
        parts: [
          {
            text: `You are a top-tier sales consultant. Using the lead and ideal client info below, generate a professional sales report in structured JSON with keys: report, predictive, outreach, questions, news.  

Lead Details:
${JSON.stringify(leadData, null, 2)}

Ideal Client Profile:
${JSON.stringify(idealClient || {}, null, 2)}

If you need recent info, call googleSearch.`,
          },
        ],
      },
    ]);

    let response = await result.response;
    let candidate = response.candidates?.[0];
    let content = candidate?.content?.parts?.[0];

    // Step 2: Handle function calls
    if (content?.functionCall) {
      const { name, args } = content.functionCall;

      if (name === "googleSearch" && args?.query) {
        const searchResults = await googleSearch(args.query);

        // Feed results back into Gemini
        result = await conversation.sendMessage([
          {
            role: "function",
            parts: [
              {
                functionResponse: {
                  name: "googleSearch",
                  response: { output: searchResults },
                },
              },
            ],
          },
        ]);

        response = await result.response;
        candidate = response.candidates?.[0];
        content = candidate?.content?.parts?.[0];
      }
    }

    // Step 3: Parse JSON output safely
    const rawText = content?.text || "No response generated.";
    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch (err) {
      parsed = {
        report: `<p>${rawText}</p>`,
        predictive: "<p>No predictive insights.</p>",
        outreach: "<p>No outreach generated.</p>",
        questions: "<p>No questions generated.</p>",
        news: "<p>No news available.</p>",
      };
    }

    res.status(200).json({
      report: parsed.report || "<p>No report generated.</p>",
      predictive: parsed.predictive || "<p>No predictive insights.</p>",
      outreach: parsed.outreach || "<p>No outreach suggestions.</p>",
      questions: parsed.questions || "<p>No questions generated.</p>",
      news: parsed.news || "<p>No news available.</p>",
    });
  } catch (error) {
    console.error("Lead qualifier error:", error);
    res.status(500).json({
      error: `Failed to generate lead report: ${error.message || error}`,
    });
  }
}
