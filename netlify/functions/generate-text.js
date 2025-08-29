import { GoogleGenerativeAI } from "@google/generative-ai";

exports.handler = async (event, context) => {
  const { prompt } = JSON.parse(event.body);

  // Use the environment variable for the API key
  const API_KEY = process.env.FIRST_API_KEY;

  if (!API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "API key is not set" }),
    };
  }

  const genAI = new GoogleGenerativeAI(API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    return {
      statusCode: 200,
      body: JSON.stringify({ text }),
    };
  } catch (error) {
    console.error("Gemini API error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Failed to generate text from Gemini API." }),
    };
  }
};
