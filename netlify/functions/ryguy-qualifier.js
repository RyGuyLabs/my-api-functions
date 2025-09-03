const { GoogleGenerativeAI } = require('@google/generative-ai');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ message: "Method Not Allowed" })
    };
  }

  try {
    const body = JSON.parse(event.body);
    const { feature, data } = body;

    const apiKey = process.env.FIRST_API_KEY;
    if (!apiKey || apiKey.trim() === '') {
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({ message: 'API Key is not configured.' })
      };
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const textModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    let prompt = '';

    switch(feature) {
      case 'content_ideas':
        if (!data?.product) {
          return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: 'Missing product description.' })
          };
        }
        prompt = `You are an expert sales and content strategist. Generate a list of at least 5 creative and engaging content ideas (e.g., blog posts, social media posts, videos, downloadable guides) to attract inbound leads for a product or service. The ideas should be relevant to the sales and marketing industry.

Product/Service: ${data.product}

Format the response clearly with headings for each type of content.`;
        break;

      case 'offer_pitch':
        if (!data?.painPoint || !data?.solution) {
          return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: 'Missing pain point or solution.' })
          };
        }
        prompt = `You are a professional B2B sales development representative. Your task is to generate a concise, compelling sales pitch using the O.F.F.E.R. framework. The framework stands for:
- **O**pportunity: The potential gain for the customer.
- **F**rustration: The problem or pain point the customer is currently facing.
- **F**ix: The specific solution you provide.
- **E**ngagement: A clear, easy call-to-action to get the conversation started.
- **R**esult: The positive outcome or benefit the customer will achieve.

Based on the following pain point and solution, write a brief pitch structured by the O.F.F.E.R. framework.

Customer's Pain Point: ${data.painPoint}
Your Solution: ${data.solution}

Structure the output with bold headings for each letter of the framework.`;
        break;

      case 'subject_lines':
        if (!data?.topic) {
          return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: 'Missing email topic.' })
          };
        }
        prompt = `You are a professional copywriter specializing in sales emails. Generate 5 creative and professional subject lines for an email about the following topic. The subject lines should be concise, intriguing, and designed to maximize open rates.

Email Topic: ${data.topic}

Format the output as a numbered list.`;
        break;

      case 'follow_up_email':
        if (!data?.notes || !data?.goal) {
          return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: 'Missing prospect notes or follow-up goal.' })
          };
        }
        prompt = `You are a friendly and professional sales representative. Draft a short, personalized follow-up email based on the following information. The email should be concise, mention the notes, and have a clear call to action to achieve the goal.

Prospect Notes: ${data.notes}
Follow-up Goal: ${data.goal}`;
        break;

      default:
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ message: `Invalid feature: ${feature}` })
        };
    }

    const response = await textModel.generateContent({ contents: [{ parts: [{ text: prompt }] }] });

    let responseText = response.response.text();

    // For the offer_pitch, convert **bold** markdown to HTML headings for your frontend
    if (feature === 'offer_pitch') {
      responseText = responseText
        .replace(/\*\*(.*?)\*\*/g, '<h4><strong>$1</strong></h4>')
        .replace(/\n/g, '<p>');
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ text: responseText })
    };

  } catch (error) {
    console.error('Error in ryguy-qualifier function:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ message: `Internal server error: ${error.message}` })
    };
  }
};
