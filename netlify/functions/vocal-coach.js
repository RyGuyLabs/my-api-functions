const { GoogleGenerativeAI } = require('@google/generative-ai');

// Define standard CORS headers for all responses
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async (event) => {
  // Handle preflight OPTIONS request for CORS
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
      console.error("API Key (FIRST_API_KEY) is not set in environment variables.");
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "Server configuration error: API key missing." }),
      };
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    
    if (action === 'generate_script') {
      // Use a faster model for simple text generation
      const textModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

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

      const promptText = "Generate only the requested short, professional speech/pitch. " + 
                         prompts[Math.floor(Math.random() * prompts.length)];

      try {
        const result = await textModel.generateContent(promptText);
        // FIX: Use (await result.response.text()) to properly resolve the content promise
        const script = (await result.response.text()).trim();

        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({ script: script }),
        };
      } catch (apiError) {
        console.error("Error during script generation:", apiError);
        return {
          statusCode: 500,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: "Failed to generate script from AI model." }),
        };
      }
    }

    if (action === 'analyze_audio') {
      // Model name is now corrected to 'gemini-2.5-pro'
      const audioModel = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

      if (!base64Audio || !prompt || !mimeType) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: "Missing required fields for audio analysis." }),
        };
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
  "scores": { "Tone": 7, ... },
  "totalScore": 75,
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
      
      try {
        const result = await audioModel.generateContent(payload);
        // FIX: Use (await result.response.text()) to properly resolve the content promise
        const responseText = (await result.response.text()).trim();

        // Fix: Clean markdown code block wrappers before JSON.parse
        const cleanedResponseText = responseText
          .replace(/^```json\s*/, '') 
          .replace(/```$/, '')        
          .trim();

        const feedback = JSON.parse(cleanedResponseText);
        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify(feedback),
        };
      } catch (jsonOrApiError) {
        console.error("Error during audio analysis (AI response/API error):", jsonOrApiError);
        return {
          statusCode: 500,
          headers: CORS_HEADERS,
          body: JSON.stringify({
            error: "Failed to process audio analysis or model response.",
            detail: (jsonOrApiError.message || "Unknown API/JSON failure").substring(0, 100) + "...",
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
    // Catches errors outside of the specific action blocks (e.g., JSON.parse failure)
    console.error("Top-level function error:", error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "An unexpected top-level server error occurred." }),
    };
  }
};
