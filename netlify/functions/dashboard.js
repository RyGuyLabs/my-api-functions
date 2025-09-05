// /netlify/functions/dashboard.js
import { Handler } from "@netlify/functions";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY // Ensure your API key is set in Netlify
});

const handler = async (event, context) => {
  // Enable CORS
  const headers = {
    "Access-Control-Allow-Origin": "*", // or restrict to your domain
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: "OK"
    };
  }

  try {
    const { feature, data } = JSON.parse(event.body || "{}");
    const prompt = data?.prompt;

    if (!feature || !prompt) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Missing feature or prompt" })
      };
    }

    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are RyGuy, a professional, polished, punchy, motivating, memorable, and resonating sales strategist." },
        { role: "user", content: prompt }
      ],
      temperature: 0.8,
      max_tokens: 600
    });

    const text = completion.choices?.[0]?.message?.content || "No response generated.";

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ text })
    };

  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message || "Server error" })
    };
  }
};

export { handler };
