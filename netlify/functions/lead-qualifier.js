// File: netlify/functions/lead-qualifier.js
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.FIRST_API_KEY);

exports.handler = async () => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-turbo" });

    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: "Hello Gemini! Please reply with a short test message." }],
        },
      ],
    });

    const responseText = result.response.text();

    return {
      statusCode: 200,
      body: JSON.stringify({ reply: responseText }),
    };
  } catch (error) {
    console.error("Lead qualifier error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
