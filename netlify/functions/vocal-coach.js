const { GoogleGenerativeAI } = require('@google/generative-ai');

const allowedOrigin = "https://www.ryguylabs.com"; // Your Squarespace domain
const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

exports.handler = async (event) => {
  // Handle preflight OPTIONS request for CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: 'Method Not Allowed',
    };
  }

  try {
    const body = JSON.parse(event.body);
    const { action, base64Audio, prompt, mimeType } = body;

    // Check API key environment variable
    const apiKey = process.env.FIRST_API_KEY;
    if (!apiKey) {
      console.error("API key is not set in environment variables.");
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: "API key is not configured." }),
      };
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

    if (action === 'generate_script') {
      // Generate a short encouraging script
      const scriptPrompt = "Generate a single, short, encouraging, and inspirational sentence for a salesperson to use as a vocal exercise. Keep it under 20 words. Do not use quotes.";
      const result = await model.generateContent(scriptPrompt);
      const script = await result.response.text();

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ script }),
      };

    } else if (action === 'analyze_audio') {
      if (!base64Audio || !prompt || !mimeType) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: "Missing required fields for audio analysis." }),
        };
      }

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

      // Try to parse JSON feedback safely
      try {
        // Option 1: Expect JSON response
        const feedback = JSON.parse(responseText.trim().replace(/^`+|`+$/g, ''));
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify(feedback),
        };

      } catch (jsonError) {
        // If JSON parse fails, fallback to sending raw text (Option 2)
        console.warn("Failed to parse AI model response as JSON:", jsonError);
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({ summary: responseText }),
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
