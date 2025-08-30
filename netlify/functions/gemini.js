const { GoogleGenerativeAI } = require('@google/generative-ai');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Get the API key from Netlify environment variables
  const apiKey = process.env.FIRST_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: 'API key not configured.' };
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-05-20" });

  try {
    const { type, prompt, audio } = JSON.parse(event.body);

    let result;
    if (type === 'text') {
      // Handle text generation
      const textPrompt = { contents: [{ parts: [{ text: prompt }] }] };
      result = await model.generateContent(textPrompt);
    } else if (type === 'analysis') {
      // Handle audio analysis
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
      result = await model.generateContent(audioPrompt);
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
    return {
      statusCode: 500,
      body: JSON.stringify({ error: { message: error.message } }),
    };
  }
};
