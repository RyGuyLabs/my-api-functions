const { GoogleGenerativeAI } = require('@google/generative-ai');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*', // You can restrict this to your domain if you want
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400', // Cache preflight response for 1 day
};

exports.handler = async (event) => {
  // Handle CORS preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204, // No Content
      headers: CORS_HEADERS,
      body: '',
    };
  }

  // Only allow POST for actual logic
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: 'Method Not Allowed',
    };
  }

  try {
    const body = JSON.parse(event.body);
    const { action, base64Audio, prompt, mimeType } = body;

    const apiKey = process.env.FIRST_API_KEY;
    if (!apiKey) {
      console.error("API key is not set.");
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "API key is not configured." }),
      };
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

    if (action === 'generate_script') {
      const scriptPrompt = "Generate a single, short, encouraging, and inspirational sentence for a salesperson to use as a vocal exercise. Keep it under 20 words. Do not use quotes.";
      const result = await model.generateContent(scriptPrompt);
      const script = await result.response.text();
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ script }),
      };
      function extractJson(text) {
        const jsonMatch = text.match(/```json([\s\S]*?)```/i)
          || text.match(/```([\s\S]*?)```/)
          || [null, text];
        return jsonMatch[1] ? jsonMatch[1].trim() : text.trim();
      }

      try {
        const jsonText = extractJson(responseText);
        const feedback = JSON.parse(jsonText);
        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify(feedback),
        };
      } catch (jsonError) {
        console.error("Failed to parse AI model response:", jsonError);
        console.log("Raw model output:", responseText);

        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({
            summary: responseText,
            error: "Response was not valid JSON, showing raw text instead."
          }),
        };
      }
    } else {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "Invalid action specified." }),
      };
    }

  } catch (error) {
    console.error("Function error:", error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "An unexpected error occurred." }),
    };
  }
};
