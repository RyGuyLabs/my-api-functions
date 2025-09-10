const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.FIRST_API_KEY);

exports.handler = async (event, context) => {
  const tool = event.queryStringParameters.tool;
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*", // Allow CORS for frontend calls
  };

  if (!tool) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Missing 'tool' query parameter." }),
    };
  }

  let prompt;

  switch (tool) {
    case "tip":
      prompt =
        'Provide one short, actionable tip on a specific communication skill, a sales technique, or a public speaking strategy. Avoid general advice like "practice."';
      break;

    case "affirmation":
      prompt = "Provide one short, positive daily affirmation.";
      break;

    case "icebreaker":
      prompt = "Provide one short, professional icebreaker question or statement.";
      break;

    // --- NEW FEATURES ADDED BELOW ---
    case "skit": {
      const characters = event.queryStringParameters.characters;
      if (!characters) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "Missing 'characters' query parameter for skit." }),
        };
      }
      prompt = `Write a short conversational skit in a friendly, lighthearted tone for ${characters}.`;
      break;
    }

    case "icp": {
      const icpCustomer = event.queryStringParameters.customer;
      const icpService = event.queryStringParameters.service;
      if (!icpCustomer || !icpService) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error: "Missing 'customer' or 'service' query parameters for ICP.",
          }),
        };
      }
      prompt = `Generate a detailed Ideal Client Profile (ICP) in a descriptive paragraph form. The ICP should describe the target customer in the "${icpCustomer}" industry and define their pain points and ideal solutions for the "${icpService}" service. Be specific about their demographics, firmographics, and challenges. Do not use headings or bullet points.`;
      break;
    }

    case "pitch": {
      const pitchCustomer = event.queryStringParameters.customer;
      const pitchService = event.queryStringParameters.service;
      if (!pitchCustomer || !pitchService) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error: "Missing 'customer' or 'service' query parameters for pitch.",
          }),
        };
      }
      prompt = `Generate a short elevator pitch for a software developer. The pitch should be no more than 3-4 sentences. It should target the "${pitchCustomer}" audience and highlight the "${pitchService}" service.`;
      break;
    }

    // --- NEW FEATURES ADDED ABOVE ---

    default:
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: `Tool "${tool}" not found.` }),
      };
  }

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-05-20" });

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ result: text }),
    };
  } catch (error) {
    console.error("API call failed:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Failed to generate content. Please try again." }),
    };
  }
};
