const { GoogleGenerativeAI } = require('@google/generative-ai');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: 'Method Not Allowed' };
  }

  try {
    const body = JSON.parse(event.body);
    const { action, base64Audio, prompt, mimeType } = body;

    const apiKey = process.env.FIRST_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "API key is not configured." }),
      };
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

    if (action === 'generate_script') {
      // Updated prompts to reflect voicemail / intro call scripts
      const prompts = [
        "Create a professional and friendly voicemail script to introduce yourself to a new customer.",
        "Write a concise and polite introduction for a cold call to a prospective client.",
        "Generate a warm and engaging opening line for a sales call.",
        "Craft a brief voicemail message that invites a potential client to schedule a call.",
        "Write a script for introducing yourself and your company on a sales call, focused on customer benefits.",
  "scores": { "Tone": 7, "Persuasiveness": 8, "Confidence": 7, "Clarity": 8, "Professional Polish": 7, "Pacing & Rhythm": 6, "Energy & Enthusiasm": 7, "Audience Engagement": 8, "Message Alignment": 7 },
  "totalScore": 65,
  "summary": {
    "strengths": "Clarity and tone were strong.",
    "areasForImprovement": "More energy and pacing control needed."
  },
  "observations": "Voice sounded slightly rushed, but articulate."
}
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
        // Clean response of backticks and whitespace before parsing
        const cleanedText = responseText.replace(/^`+|`+$/g, '').trim();
        const feedback = JSON.parse(cleanedText);
        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify(feedback),
        };
      } catch (jsonError) {
        console.error("Failed to parse AI model response:", jsonError, "Raw response:", responseText);
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

    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Invalid action specified." }),
    };

  } catch (error) {
    console.error("Function error:", error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "An unexpected error occurred." }),
    };
  }
};
