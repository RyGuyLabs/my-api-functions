// File: netlify/functions/lead-qualifier.js
const { GoogleGenerativeAI, Tool } = require('@google/generative-ai');

// Load your API keys and search engine ID from Netlify Environment Variables
const geminiApiKey = process.env.FIRST_API_KEY; 
const searchApiKey = process.env.RYGUY_SEARCH_API_KEY;
const searchEngineId = process.env.RYGUY_SEARCH_ENGINE_ID;

// Initialize the Gemini API client
const genAI = new GoogleGenerativeAI(geminiApiKey);

// Define the Google Search tool for Gemini to use
const searchTool = {
  toolSpec: {
    name: "google_search_retrieval",
    description: "Search Google for up-to-date information.",
    inputParameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query."
        }
      },
      required: ["query"]
    }
  },
  toolCode: {
    googleSearch: {
      apiKey: searchApiKey,
      cx: searchEngineId
    }
  }
};

exports.handler = async function(event, context) {
  try {
    const { leadData, idealClient } = JSON.parse(event.body || '{}');

    // Create the model instance with the search tool
    const model = genAI.getGenerativeModel({ 
      model: "gemini-pro",
      tools: [searchTool]
    });

    // Create a chat session to enable the model to use tools
    const chat = model.startChat();

    // Combine lead and ideal client data into a single, comprehensive prompt
    const combinedPrompt = `
      You are a world-class sales consultant. Using the following lead and ideal client details, and using the Google Search tool when necessary, generate a comprehensive sales report.

      Lead Details:
      ${JSON.stringify(leadData, null, 2)}

      Ideal Client Profile:
      ${JSON.stringify(idealClient, null, 2)}

      Please structure your response as a single JSON object with the following keys and content:
      1.  "report": A professional, insightful, and detailed Qualification Report.
      2.  "predictive": Predictive Engagement Insights, highlighting likelihood of conversion, key leverage points, urgency, and emotional drivers.
      3.  "outreach": Strategic, persuasive, and memorable outreach strategies.
      4.  "questions": Insightful discovery questions tailored to uncover needs, objections, and motivations.
      5.  "news": A summary of recent news and contextual insights about the lead or their company's industry. Use the Google Search tool to find the most relevant and up-to-date information for this section.
    `;
    
    // Send the prompt to Gemini
    const result = await chat.sendMessage(combinedPrompt);
    const text = result.response.text();

    // The Gemini API returns a string. We must parse it as JSON.
    const aiResponse = JSON.parse(text);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        report: aiResponse.report,
        predictive: aiResponse.predictive,
        outreach: aiResponse.outreach,
        questions: aiResponse.questions,
        news: aiResponse.news,
      }),
    };

  } catch (error) {
    console.error('Error generating report:', error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: `Failed to generate lead report: ${error.message}` }),
    };
  }
};
