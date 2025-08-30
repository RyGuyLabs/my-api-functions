const { GoogleGenerativeAI } = require('@google/generative-ai');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Get the API key from Netlify environment variables
  const apiKey = process.env.FIRST_API_KEY;
  if (!apiKey) {
    console.error('API key not configured.');
    return { statusCode: 500, body: 'API key not configured.' };
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  // We'll use a more stable model for this specific task
  // The 'gemini-2.5-flash' model can be more restrictive
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });

  try {
    const { type, prompt, audio } = JSON.parse(event.body);

    let result;
    if (type === 'text') {
      // This part of the function remains the same, using a text-only model.
      const textModel = genAI.getGenerativeModel({ model: "gemini-1.0-pro" });
      const textPrompt = { contents: [{ parts: [{ text: prompt }] }] };
      result = await textModel.generateContent(textPrompt);
    } else if (type === 'analysis') {
      // Handle audio analysis with the multimodal model
      const systemInstruction = {
        role: "user",
        parts: [{ text: "You are a professional vocal coach. Your goal is to provide concise, structured, and encouraging feedback on a user's vocal performance. Analyze their tone based on the goals of being confident, calm, and persuasive. Format your response as a JSON object with a score from 1-100 for confidence and clarity, a 1-2 sentence summary, and bullet points for strengths, improvements, and next steps." }],
      };

      const audioPrompt = {
        contents: [{
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: "audio/webm",
                data: audio
              }
            }
          ]
        }],
      };
      
      const generationConfig = {
        responseMimeType: "application/json",
      };

      // Use generateContent with the systemInstruction and generationConfig
      result = await model.generateContent({
        contents: audioPrompt.contents,
        systemInstruction: systemInstruction.parts[0],
        generationConfig: generationConfig,
      });

    } else {
      return { statusCode: 400, body: 'Invalid request type.' };
    }

    const response = await result.response;
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(response),
    };

  } catch (error) {
    console.error('API call failed:', error);
    // Return a more descriptive error message to the front end
    if (error.message.includes('403 Forbidden')) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: { message: "Permission denied for this API call. Your API key or service account may not have access to this feature or model." } }),
      };
    }
    return {
      statusCode: 500,
      body: JSON.stringify({ error: { message: error.message } }),
    };
  }
};
