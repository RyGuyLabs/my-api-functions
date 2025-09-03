const { GoogleGenerativeAI } = require('@google/generative-ai');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function response(statusCode, body) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    // Preflight request
    return {
      statusCode: 204,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return response(405, { error: 'Method Not Allowed' });
  }

  try {
    const body = JSON.parse(event.body);
    const { action, base64Audio, prompt, mimeType } = body;

    const apiKey = process.env.FIRST_API_KEY;
    if (!apiKey) {
      return response(500, { error: 'API key is not configured.' });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });

    if (action === 'generate_script') {
      const prompts = [
        "Speak like you're inspiring a team to reach their monthly goals.",
        "Deliver a short pitch about the importance of customer empathy.",
        "Recite a 15-word motivational message for a cold-calling sales rep.",
        "Speak a one-liner that could close a deal on the spot.",
        "Say something that would boost a discouraged teammate's confidence.",
        "Create a 10-15 word pitch introducing yourself and your company.",
        "Share a quick elevator pitch that excites a potential client.",
        "Speak a phrase that sounds confident, encouraging, and assertive.",
        "Say something that communicates leadership in less than 20 words.",
        "Deliver a sentence that would energize a sales team in the morning."
      ];

      const promptText = prompts[Math.floor(Math.random() * prompts.length)];

      const result = await model.generateContent(promptText);
      const script = await result.response.text();

      return response(200, { script: script.trim() });
    }

    if (action === 'analyze_audio') {
      if (!base64Audio || !prompt || !mimeType) {
        return response(400, { error: 'Missing required fields for audio analysis.' });
      }

      const systemInstruction = `
You are a vocal coach and sales communication expert. Analyze a user reading a short sales script.

Rate performance in 9 categories (1–10), total score = 90:
1. Tone
2. Persuasiveness
3. Confidence
4. Clarity
5. Professional Polish
6. Pacing & Rhythm
7. Energy & Enthusiasm
8. Audience Engagement
9. Message Alignment

Also include:
- Summary of strengths
- Areas for improvement
- Voice observations

Respond ONLY in raw JSON format (no markdown, no formatting). Example:
{
  "scores": { "Tone": 7, "Persuasiveness": 8, "Confidence": 7, "Clarity": 8, "Professional Polish": 7, "Pacing & Rhythm": 6, "Energy & Enthusiasm": 7, "Audience Engagement": 6, "Message Alignment": 8 },
  "totalScore": 64,
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
            role: 'user',
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
        const feedback = JSON.parse(responseText.replace(/^`+|`+$/g, ''));
        return response(200, feedback);
      } catch (jsonError) {
        console.error('Failed to parse AI model response:', jsonError);
        return response(500, {
          error: 'Invalid response from the AI model.',
          raw: responseText,
        });
      }
    }

    return response(400, { error: 'Invalid action specified.' });
  } catch (error) {
    console.error('Function error:', error);
    return response(500, { error: 'An unexpected error occurred.' });
  }
};
