// File: netlify/functions/lead-qualifier.js
const { GoogleGenerativeAI } = require('@google/generative-ai');

const geminiApiKey = process.env.FIRST_API_KEY;
const searchApiKey = process.env.RYGUY_SEARCH_API_KEY;
const searchEngineId = process.env.RYGUY_SEARCH_ENGINE_ID;

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(geminiApiKey);

// Define the Google Search tool for Gemini's reference
const searchTool = {
  toolSpec: {
    name: "google_search_retrieval",
    description: "Search Google for up-to-date information.",
    inputParameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" }
      },
      required: ["query"]
    }
  },
  // The toolCode block is not for direct execution
  toolCode: {
    googleSearch: { apiKey: searchApiKey, cx: searchEngineId }
  }
};

// --- Your new, corrected handler function ---
exports.handler = async function(event) {
  try {
    const { leadData, idealClient } = JSON.parse(event.body || '{}');

    if (!leadData) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing leadData" }) };
    }

    // Initialize the Gemini model
    const model = genAI.getGenerativeModel({ model: "gemini-pro", tools: [searchTool] });
    const chat = model.startChat();

    // Compose prompt
    const combinedPrompt = `
      You are a top-tier sales consultant. Using the lead and ideal client info below, generate a professional sales report with HTML formatting. Use the Google Search tool for the 'news' section if needed.

      Lead Details:
      ${JSON.stringify(leadData, null, 2)}

      Ideal Client Profile:
      ${JSON.stringify(idealClient || {}, null, 2)}

      Return a JSON object with keys:
      1. report
      2. predictive
      3. outreach
      4. questions
      5. news
      Each value should be HTML-ready.
    `;

    // Send initial prompt to the model
    const initialResponse = await chat.sendMessage(combinedPrompt);

    // Get the response text
    let responseText = initialResponse.response.text();

    // Check if the model has a tool request and is not a direct response
    if (initialResponse.response.toolCalls && initialResponse.response.toolCalls.length > 0) {
      // Get the tool call object
      const toolCall = initialResponse.response.toolCalls[0];
      const { query } = toolCall.args;

      // Manually perform the search using the query
      const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${searchApiKey}&cx=${searchEngineId}&q=${encodeURIComponent(query)}`;
      const searchResponse = await fetch(searchUrl);
      const searchResults = await searchResponse.json();

      // Extract and format the search results to send back to Gemini
      let formattedResults = "No search results found.";
      if (searchResults.items && searchResults.items.length > 0) {
        formattedResults = searchResults.items.map(item => `Title: ${item.title}, Snippet: ${item.snippet}`).join('\n\n');
      }

      // Send the formatted search results back to the chat for a final response
      const followupResponse = await chat.sendMessage({
        role: 'tool',
        content: formattedResults
      });
      responseText = followupResponse.response.text();
    }

    // Now, parse the final response text
    let aiResponse;
    try {
      aiResponse = JSON.parse(responseText);
    } catch (parseErr) {
      console.error('Gemini JSON parse failed, returning raw text as fallback', parseErr);
      aiResponse = {
        report: `<p>${responseText}</p>`,
        predictive: `<p>${responseText}</p>`,
        outreach: `<p>${responseText}</p>`,
        questions: `<p>${responseText}</p>`,
        news: `<p>${responseText}</p>`
      };
    }
    
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        report: aiResponse.report || "<p>No report generated.</p>",
        predictive: aiResponse.predictive || "<p>No predictive insights.</p>",
        outreach: aiResponse.outreach || "<p>No outreach suggestions.</p>",
        questions: aiResponse.questions || "<p>No questions generated.</p>",
        news: aiResponse.news || "<p>No news available.</p>"
      })
    };

  } catch (error) {
    console.error("Lead qualifier error:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: `Failed to generate lead report: ${error.message}` })
    };
  }
};
