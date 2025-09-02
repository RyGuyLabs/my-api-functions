const { GoogleGenerativeAI } = require('@google/generative-ai');

exports.handler = async (event) => {
  // Handle CORS preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
      body: ""
    };
  }

  // Only allow POST for main logic
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ error: "Method Not Allowed, use POST" }),
    };
  }

  // CORS headers to allow calls from your frontend
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  try {
    const body = JSON.parse(event.body);
    const { action, base64Audio, prompt, mimeType } = body;

    // Ensure API key is set in environment variables on Netlify
    const apiKey = process.env.FIRST_API_KEY;
    if (!apiKey) {
      console.error("API key not set in environment.");
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: "API key not configured." }),
      };
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

    if (action === 'generate_script') {
      // Prompt to generate a short, encouraging script
      const scriptPrompt = "Generate a single, short, encouraging, and inspirational sentence for a salesperson to use as a vocal exercise. Keep it under 20 words. Do not use quotes.";

      const result = await model.generateContent(scriptPrompt);
      const script = await result.response.text();

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ script }),
      };

    } else if (action === 'analyze_audio') {
      // Validate inputs for audio analysis
      if (!base64Audio || !prompt || !mimeType) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: "Missing required fields for audio analysis." }),
        };
      }

      // Prepare payload combining prompt text + audio data for the model
      const payload = {
        contents: [{
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Audio,
              }
            }
          ]
        }]
      };

      const result = await model.generateContent(payload);
      const responseText = await result.response.text();

      try {
        // The model response should be JSON with feedback summary, parse it
        const feedback = JSON.parse(responseText.trim().replace(/^`+|`+$/g, ''));
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify(feedback),
        };
      } catch (jsonError) {
        console.error("Failed to parse AI model response:", jsonError);
        return {
          statusCode: 500,
          headers: corsHeaders,
          body: JSON.stringify({ error: "Invalid response from the AI model." }),
        };
      }

    } else {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Invalid action specified." }),
      };
    }

  } catch (error) {
    console.error("Function error:", error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: "An unexpected error occurred." }),
    };
  }
};
