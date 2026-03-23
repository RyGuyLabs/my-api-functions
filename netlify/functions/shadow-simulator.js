const fetch = require('node-fetch');

/**
 * RyGuyLabs Production Interview Simulator Backend
 * Handles dynamic personas, industry-specific logic, and anxiety-marker analysis.
 */
exports.handler = async (event, context) => {
  // 1. Production-Grade CORS & Security Headers
  const allowedOrigins = ["https://www.ryguylabs.com", "https://ryguylabs.com"];
  const requestOrigin = event.headers?.origin || event.headers?.Origin;
  const accessControlOrigin = allowedOrigins.includes(requestOrigin) ? requestOrigin : allowedOrigins[0];

  const headers = {
    "Access-Control-Allow-Origin": accessControlOrigin,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "X-Content-Type-Options": "nosniff"
  };

  // Handle Preflight Handshake
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers };

  // Validate POST Method
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  try {
    // 2. Data Extraction & Default Fail-safes
    const body = event.body ? (typeof event.body === 'string' ? JSON.parse(event.body) : event.body) : {};
    
    const {
      message = "",
      history = [],
      interviewerType = "Senior Recruiter", // CEO, HR, Technical Lead, etc.
      targetRole = "Professional",
      industry = "General Business",
      companyCulture = "High-Performance"
    } = body;

    const apiKey = process.env.SHADOW_SIM_KEY;
    if (!apiKey) throw new Error("Backend Configuration Error: Missing API Key.");

    // 3. The "Shadow Execution" System Prompt
    // This is the core logic that ensures "Tactical Resonance"
    const systemPrompt = `You are a Professional Interview Simulator.
CURRENT ROLE: ${interviewerType}
INDUSTRY: ${industry}
TARGET ROLE: ${targetRole}
CULTURE: ${companyCulture}

MISSION: 
Conduct a realistic interview. You are evaluating the candidate's fit, technical competence, and executive presence.

TACTICAL RESONANCE PROTOCOL:
Analyze the user's message for "Anxiety Markers" (hesitation, filler words, over-explaining, or lack of eye-contact cues in text).
After every turn, you must provide a psychological and tactical breakdown.

STRICT OUTPUT FORMAT (Return ONLY JSON):
{
  "interviewerResponse": "Your next question or statement in character as the ${interviewerType}.",
  "tacticalResonance": {
    "userAnalysis": "A breakdown of the user's last response, highlighting specific anxiety markers or verbal stumbles.",
    "strength": "The most effective part of their communication.",
    "weakness": "The specific area where they showed hesitation or low authority.",
    "correction": "A high-authority, rescripted version of what the user should have said to sound dominant and prepared."
  },
  "stressLevel": "1-10",
  "interviewStatus": "Ongoing/Success/Fail"
}`;

    // 4. API Execution with Gemini 1.5 Flash
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [{ 
            text: `SYSTEM_INSTRUCTIONS:\n${systemPrompt}\n\n` +
                  `IS_FIRST_TURN: ${history.length === 0}\n` +
                  `USER_MESSAGE: "${message}"\n` +
                  `CHAT_HISTORY: ${JSON.stringify(history.slice(-10))}`
          }]
        }],
        generationConfig: { 
          responseMimeType: "application/json", 
          temperature: 0.75,
          topP: 0.95
        }
      })
    });

    if (!response.ok) throw new Error(`External API Failure: ${response.status}`);

    const result = await response.json();
    const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    
    // Safety check to ensure valid JSON extraction
    const jsonStart = rawText.indexOf('{');
    const jsonEnd = rawText.lastIndexOf('}');
    if (jsonStart === -1) throw new Error("AI failed to return structured data.");
    
    const responseData = JSON.parse(rawText.substring(jsonStart, jsonEnd + 1));

    // 5. Success Return
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(responseData)
    };

  } catch (error) {
    console.error("RyGuyLabs Production Error:", error.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: "Simulation Interrupted",
        details: error.message 
      })
    };
  }
};
