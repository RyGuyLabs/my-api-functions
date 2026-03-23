exports.handler = async (event, context) => {
  // 1. DYNAMIC CORS HEADERS
  const allowedOrigins = ["https://www.ryguylabs.com", "https://ryguylabs.com"];
  const requestOrigin = event.headers?.origin || event.headers?.Origin;
  const accessControlOrigin = allowedOrigins.includes(requestOrigin) ? requestOrigin : allowedOrigins[0];

  const headers = {
    "Access-Control-Allow-Origin": accessControlOrigin,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };

  // 2. PREFLIGHT HANDSHAKE
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers };

  try {
    const body = JSON.parse(event.body || "{}");
    const { 
      message, 
      history = [], 
      targetRole = "Professional", 
      industry = "General Business",
      interviewerType = "Senior Manager" 
    } = body;

    // Safety: Block Profanity/Vulgarity
    const vulgarityFilter = /\b(fuck|shit|asshole|bitch|piss|cunt)\b/i;
    if (vulgarityFilter.test(message)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Input contains restricted language. Please maintain professional standards." })
      };
    }

    const apiKey = process.env.SHADOW_SIM_KEY;
    if (!apiKey) throw new Error("SHADOW_SIM_KEY is missing in Netlify environment variables.");

    // 3. THE "DUAL-TRACK" SYSTEM PROMPT
    const systemPrompt = `You are an Interview Simulator.
    CONTEXT: Interviewing a candidate for ${targetRole} in the ${industry} industry.
    YOUR PERSONA: A ${interviewerType} who is professional, observant, and evaluative.

    MISSION:
    1. Reply as the interviewer. Keep it realistic and industry-specific.
    2. Analyze the candidate's last message for "Anxiety Markers" (hedging, filler words, weak phrasing).
    
    REQUIRED JSON OUTPUT:
    {
      "interviewerReply": "Your next interview question/comment",
      "tacticalResonance": {
        "strength": "Cite exact phrasing used and why it worked.",
        "weakness": "Cite exact phrasing that showed hesitation or low authority.",
        "improvement": "Exactly how to rephrase that specific weakness for maximum impact."
      },
      "stressLevel": "1-10"
    }`;

    // 4. API CALL (Using Global Fetch)
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    const apiResponse = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [{ text: `SYSTEM_INSTRUCTIONS:\n${systemPrompt}\n\nUSER_MESSAGE: "${message}"\nCHAT_HISTORY: ${JSON.stringify(history.slice(-10))}` }]
        }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.7 }
      })
    });

    const result = await apiResponse.json();
    const rawContent = result.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    
    // Safety Parse
    const cleanData = JSON.parse(rawContent.substring(rawContent.indexOf('{'), rawContent.lastIndexOf('}') + 1));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(cleanData)
    };

  } catch (error) {
    console.error("Simulation Error:", error.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Simulation Interrupted: Check backend logs." })
    };
  }
};
