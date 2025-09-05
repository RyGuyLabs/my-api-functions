// functions/dashboard.js
const { Configuration, OpenAIApi } = require("openai");

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY, // Ensure your Netlify environment has this
});

const openai = new OpenAIApi(configuration);

exports.handler = async function (event) {
  try {
    // Handle preflight request for CORS
    if (event.httpMethod === "OPTIONS") {
      return {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
        body: "",
      };
    }

    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        body: "Method Not Allowed",
      };
    }

    const { feature, data } = JSON.parse(event.body);

    const { name, company, purpose, formOfContact } = data;

    if (!name || !company || !purpose) {
      return {
        statusCode: 400,
        body: JSON.stringify({ text: "Error: Missing required fields." }),
        headers: { "Access-Control-Allow-Origin": "*" },
      };
    }

    let prompt = "";

    if (feature === "lead_idea") {
      prompt = `You are an expert sales consultant. Generate a highly detailed, polished, and professional strategy for contacting a prospect. Use the following information to create a unique, actionable, and memorable plan.  

Lead Name: ${name}  
Company: ${company}  
Purpose of Contact: ${purpose}  
Form of Contact: ${formOfContact}  

Requirements:  
- The idea must be fully tailored to the prospect and form of contact.  
- Include steps the salesperson should take, phrasing examples, and professional tips.  
- Make it motivating, punchy, and memorable.  
- Response should be more than one sentence; it should feel like a mini-strategy guide.`;
    } else if (feature === "nurturing_note") {
      prompt = `You are an expert sales consultant. Generate a short, warm, professional, and memorable closing note to include at the end of a message to a prospect. Use the following information:

Lead Name: ${name}  
Company: ${company}  
Purpose of Contact: ${purpose}  

Requirements:  
- The note should be kind, insightful, and engaging.  
- Suggest a thoughtful remark the salesperson can use to end the contact.  
- Keep it concise but with a polished and professional tone.  
- Each output should feel unique and human-written.`;
    } else {
      return {
        statusCode: 400,
        body: JSON.stringify({ text: "Error: Invalid feature." }),
        headers: { "Access-Control-Allow-Origin": "*" },
      };
    }

    const completion = await openai.createChatCompletion({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.85,
      max_tokens: 500,
    });

    const text = completion.data.choices[0].message.content.trim();

    return {
      statusCode: 200,
      body: JSON.stringify({ text }),
      headers: {
        "Access-Control-Allow-Origin": "*", // Fixes CORS
      },
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ text: `Server Error: ${err.message}` }),
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    };
  }
};
