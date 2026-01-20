exports.handler = async (event, context) => {
  // Handle Preflight OPTIONS request for CORS
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: "Method Not Allowed"
    };
  }

  try {
    const { hobbies, skills, talents, country } = JSON.parse(event.body);
    const apiKey = process.env.FIRST_API_KEY;

    if (!apiKey) {
      return {
        statusCode: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Environment variable FIRST_API_KEY is missing." })
      };
    }

    const systemPrompt = `You are a Career Alignment Engine. Your primary objective is to extract specific personal characteristics (hobbies, interests, skills, experience) from the user and align them with an ideal career path. You must provide clear steps for attainment and a realistic earning measure for their region.`;

    const userPrompt = `
    User Profile Extraction:
    - Hobbies & Interests: ${hobbies}
    - Technical/Soft Skills: ${skills}
    - Natural Talents: ${talents}
    - Geographical Context: ${country}

    Based on these characteristics, generate a Career Alignment Blueprint.
    Return ONLY a JSON object:
    {
        "careerTitle": "The specific ideal job role",
        "alignmentScore": 98,
        "earningPotential": "Annual salary range in local currency",
        "attainmentPlan": [
            "Specific educational or certification step",
            "Practical experience or portfolio building step",
            "Networking or application strategy"
        ],
        "reasoning": "A detailed explanation of how their specific hobbies and skills translate to success in this role.",
        "searchKeywords": ["Job title 1", "Search term 2"]
    }`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: userPrompt }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.7
        }
      })
    });

    const result = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Upstream API error", details: result })
      };
    }

    if (!result.candidates || !result.candidates[0]?.content?.parts?.[0]?.text) {
      return {
        statusCode: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "No data returned from API" })
      };
    }

    const careerData = JSON.parse(result.candidates[0].content.parts[0].text);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify(careerData)
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Internal processing error", message: error.message })
    };
  }
};
