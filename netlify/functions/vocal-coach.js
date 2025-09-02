const { GoogleGenerativeAI } = require('@google/generative-ai');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async (event) => {
  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204, // No Content for preflight
      headers: CORS_HEADERS,
      body: '',
    };
  }

  // Only allow POST requests
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
    }

    else if (action === 'analyze_audio') {
      if (!base64Audio || !prompt || !mimeType) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: "Missing required fields for audio analysis." }),
        };
      }

      const systemInstruction = `
You are a professional vocal coach and sales communication expert. You are analyzing a voice recording of a user reading a short sales script. Rate the user's performance using the following 10 categories, each scored from 1 to 10. The total score must equal 100.

1. Tone – Is the tone warm, friendly, and engaging?
2. Persuasiveness – Does the speaker sound convincing and emotionally compelling?
3. Confidence – Does the speaker sound assured and in control?
4. Clarity – Is the speech clear, well-articulated, and easy to understand?
5. Sales Orientation – Does the delivery feel tailored to sales and persuasion?
6. Professional Polish – Does the speaker sound refined and poised?
7. Pacing & Rhythm – Is the pace natural, and does the speech flow well?
8. Energy & Enthusiasm – Is there liveliness and passion in the voice?
9. Audience Engagement – Does the delivery likely hold the listener’s attention?
10. Message Alignment – Does the tone match the message content?

Return the result as a JSON object with:
- Individual scores for each category
- Total score
- A written summary of strengths and areas for improvement
- Specific observations about the user's voice

Format the output as valid JSON.
`;

      const payload = {
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: mimeType,
                  data: base64Audio,
                },
              },
            ],
          },
        ],
        systemInstruction: {
          parts: [{ text: systemInstruction }],
        },
      };

      const result = await model.generateContent(payload);
      const responseText = (await result.response.text()).trim();

      try {
        // Remove ```json markdown fences if present
        const cleanedResponse = responseText.replace(/^```json\s*/, '').replace(/```$/, '').trim();

        const feedback = JSON.parse(cleanedResponse);
        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify(feedback),
        };
      } catch (jsonError) {
        console.error("Failed to parse AI model response:", jsonError);
        console.log("Raw model output:", responseText);
        return {
          statusCode: 500,
          headers: CORS_HEADERS,
          body: JSON.stringify({
            error: "Invalid response from the AI model.",
            raw: responseText,
          }),
        };
      }
    }

    else {
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
