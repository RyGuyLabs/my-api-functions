const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

exports.handler = async (event) => {
  const allowedOrigins = ["https://www.ryguylabs.com", "https://ryguylabs.com"];
  const origin = event.headers.origin || event.headers.Origin;
  const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  const headers = {
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers };

  try {
    const { message, history, targetRole, industry, interviewerType } = JSON.parse(event.body);
    const apiKey = process.env.SHADOW_SIM_KEY;

    const systemPrompt = `You are a ${interviewerType} interviewing for a ${targetRole} position in ${industry}. 
    Analyze the user's anxiety markers. Return ONLY JSON:
    {
      "interviewerReply": "next question",
      "tacticalResonance": {
        "strength": "exact quote + why",
        "weakness": "exact quote + anxiety marker",
        "improvement": "how to say it better"
      },
      "stressLevel": 1-10
    }`;

    const res = await fetch(`${API_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: `${systemPrompt}\n\nUser: ${message}\nHistory: ${JSON.stringify(history.slice(-6))}` }]
        }],
        generationConfig: { responseMimeType: "application/json" }
      })
    });

    const data = await res.json();
    const text = data.candidates[0].content.parts[0].text;

    return { statusCode: 200, headers, body: text };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
