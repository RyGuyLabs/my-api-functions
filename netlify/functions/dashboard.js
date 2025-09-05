export async function handler(event, context) {
  // Enable CORS for your Squarespace domain
  const headers = {
    "Access-Control-Allow-Origin": "https://www.ryguylabs.com",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  // Handle preflight requests
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ text: "Method Not Allowed" }),
    };
  }

  try {
    const { feature, data } = JSON.parse(event.body);

    const { name, company, purpose, formOfContact } = data;

    if (!name || !company || !purpose) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ text: "Please provide name, company, and purpose." }),
      };
    }

    let responseText = "";

    if (feature === "lead_idea") {
      responseText = `Idea for reaching ${name} at ${company} via ${formOfContact}:\n\n` +
        `Create a thoughtful, personalized approach that speaks directly to their needs. ` +
        `Reference ${purpose} specifically and explain how your solution can make a meaningful impact. ` +
        `Engage with enthusiasm and clarity, providing value upfront, and end with a compelling call to action. ` +
        `Ensure the message is professional, memorable, and leaves a strong impression that encourages a positive response.`;
    } else if (feature === "nurturing_note") {
      responseText = `Nurturing note for ${name} at ${company}:\n\n` +
        `Consider sending a warm, considerate message that acknowledges their priorities and expresses genuine interest. ` +
        `Include a thoughtful remark related to ${purpose}, offer helpful insight or resources if appropriate, ` +
        `and close with an encouraging note that reinforces your availability and commitment to supporting their goals. ` +
        `This note should feel personal, professional, and leave them feeling valued and understood.`;
    } else {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ text: "Invalid feature type." }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ text: responseText }),
    };
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ text: `Server error: ${error.message}` }),
    };
  }
}
