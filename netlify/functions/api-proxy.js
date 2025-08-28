const { GoogleGenerativeAI } = require('@google/generative-ai');
const { marked } = require('marked');

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ message: 'Method Not Allowed' }),
      headers: {
        'Access-Control-Allow-Origin': '*'
      }
    };
  }

  const headers = {
    'Access-Control-Allow-Origin': '*'
  };

  try {
    const { feature, userGoal, textToSpeak } = JSON.parse(event.body);

    const geminiApiKey = process.env.FIRST_API_KEY;

    if (!geminiApiKey) {
        return {
            statusCode: 500,
            body: JSON.stringify({ message: `Missing API key.` }),
            headers
        };
    }

    const genAI = new GoogleGenerativeAI(geminiApiKey);
    let prompt = '';
    let response;

    switch (feature) {
      case 'plan':
        prompt = `You are RyGuy, a motivational coach who is friendly, personable, and subtly humorous. A user has described a future they hope to achieve. Their goal is: "${userGoal}". Your task is to provide a thoughtful, empathetic, and encouraging plan to help them achieve this goal. Structure your response in a well-written, easy-to-read format. Your response must include the following elements: 1. An opening that acknowledges their goal in an encouraging tone. 2. A short, actionable plan with 3-5 steps. 3. The tone must be thoughtful, empathetic, encouraging, personable, friendly, and subtly humorous. 4. A unique motivational quote from RyGuy that is unique to him and will resonate with the user. 5. The final sentence of the entire response MUST be the exact text: "You Got This with RyGuy Labs". Do not add any extra punctuation or text after this line. Example response structure: Hey there! That's an awesome goal... Here's a little plan to get you started: 1. ... 2. ... 3. ... RyGuy's words of wisdom: "Your journey isn't a race, it's a wonderfully weird hike. Enjoy the views, even the quirky ones." You Got This with RyGuy Labs`;
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        response = await model.generateContent(prompt);
        break;

      case 'pep_talk':
        prompt = `You are RyGuy, a motivational coach. The user's goal is: "${userGoal}". Craft a short, enthusiastic, and friendly pep talk from RyGuy. Keep it brief and to the point, focusing on encouragement. Conclude with the exact text: "You Got This with RyGuy Labs".`;
        const pepTalkModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        response = await pepTalkModel.generateContent(prompt);
        break;

      case 'vision_prompt':
        prompt = `You are a creative visualization assistant. The user's goal is: "${userGoal}". Create a highly detailed and descriptive text prompt for an AI image generation model (like DALL-E or Midjourney) that visualizes this goal. Include specific details about style, colors, mood, and elements to include. For example, if the goal is "I want to be a writer," your prompt might be "A cozy writer's studio bathed in warm afternoon sunlight, a steaming cup of tea on a vintage wooden desk. Piles of handwritten notebooks and a loyal golden retriever sleeping nearby. The style is soft focus, impressionistic, and warm tones." Do not include the user's goal in the final text. Provide only the prompt text itself.`;
        const visionModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        response = await visionModel.generateContent(prompt);
        break;

      case 'obstacle_analysis':
        prompt = `You are a helpful and realistic life coach. The user's goal is: "${userGoal}". Analyze this goal and identify 3-4 potential obstacles or challenges the user might face. For each obstacle, provide a simple, practical tip or mindset to overcome it. Format your response as a clear, easy-to-read list.`;
        const obstacleModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        response = await obstacleModel.generateContent(prompt);
        break;

      case 'tts':
        const audioModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-tts' });
        const textParts = marked.parse(textToSpeak).split('</p>').map(p => ({ text: p.replace(/<[^>]*>/g, '').trim() })).filter(p => p.text.length > 0);

        const ttsResponse = await audioModel.generateContent({
          contents: [{
            parts: textParts,
          }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: "Fenrir" }
              }
            }
          },
        });

        const audioPart = ttsResponse?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
        if (!audioPart) {
          throw new Error("Invalid audio response format from TTS API.");
        }

        return {
          statusCode: 200,
          body: JSON.stringify({
            audioData: audioPart.data,
            mimeType: audioPart.mimeType
          }),
          headers
        };

      default:
        return {
          statusCode: 400,
          body: JSON.stringify({ message: 'Invalid feature requested.' }),
          headers
        };
    }
    const jsonResponse = response.response;
    return {
      statusCode: 200,
      body: JSON.stringify(jsonResponse),
      headers
    };

  } catch (error) {
    console.error('Error in proxy:', error);
    return {
      statusCode: error.response?.status || 500,
      body: JSON.stringify({
        message: 'Error generating content.',
        error: error.message,
        details: error.response?.data?.error?.message || 'No additional details.'
      }),
      headers
    };
  }
};
