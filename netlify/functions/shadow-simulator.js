exports.handler = async (event, context) => {
  // 1. DYNAMIC ORIGIN CHECK (Handles www vs non-www)
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
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers };
  }

  // 3. METHOD VALIDATION
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  // ✅ FIX: start try block in correct place
  try {

    const body = event.body ? (typeof event.body === 'string' ? JSON.parse(event.body) : event.body) : {};
    const message = body.message || "";
    const history = Array.isArray(body.history) ? body.history : [];
    const persona = body.persona || "Aggressive CEO";
    const careerPath = body.careerPath || "Professional";
    const industry = body.industry || "General";    

    if (!persona || typeof persona !== "string") {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "https://www.ryguylabs.com"
        },
        body: JSON.stringify({ error: "Invalid persona" })
      };
    }

    if (!careerPath || typeof careerPath !== "string") {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "https://www.ryguylabs.com"
        },
        body: JSON.stringify({ error: "Invalid career path" })
      };
    }

    if (!industry || typeof industry !== "string") {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "https://www.ryguylabs.com"
        },
        body: JSON.stringify({ error: "Invalid industry" })
      };
    }

    if (!message || typeof message !== "string") {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "https://www.ryguylabs.com" },
        body: JSON.stringify({ error: "Invalid message input" })
      };
    }

    if (!Array.isArray(history)) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "https://www.ryguylabs.com" },
        body: JSON.stringify({ error: "Invalid history format" })
      };
    }

    const apiKey = process.env.SHADOW_SIM_KEY;
    if (!apiKey) throw new Error("Missing SHADOW_SIM_KEY");

    const safeHistory = Array.isArray(history) ? history.slice(-20) : [];
    // 1️⃣ FIRST-TURN MESSAGE FALLBACK
const defaultMessages = [
  "Let's begin the interview scenario.",
  "You have 30 seconds to justify your strategy.",
  "Pretend I'm your skeptical CEO. Start now.",
  "Open with your strongest business case.",
  "Convince me why you're the best fit for this role."
];

// If message is empty on first turn, pick a default
const userMessage = message || (safeHistory.length === 0 ? defaultMessages[Math.floor(Math.random() * defaultMessages.length)] : "");
    
    const systemPrompt = `You are the "Shadow Execution Simulator."
The user is training to overcome social anxiety and professional hesitation for the career path: ${careerPath} in the ${industry} industry.

YOUR PERSONA: You are a ${persona} (Skeptical, High-Status, Time-Poor).

STRICT BEHAVIOR RULES:
- You are a high-value decision-maker with zero patience for fluff or "soft" communication.
- You challenge vague or hesitant answers immediately to test the user's resolve.
- You do NOT provide encouragement—you provide realistic professional resistance.
- Keep responses sharp, concise, and focused on ROI and competence.
- Never break character.

REALISM RULES:
- Use industry-specific pressure (e.g., "We have three other candidates with better numbers," or "Explain the technical debt here").
- Reference specific business concerns: Performance, Risk, Revenue, and Executive Presence.
- Vary your tone naturally; use skepticism rather than robotic hostility.

ESCALATION SYSTEM:
- If the user shows repeated hesitation (e.g., "I think," "sorry," "just"), increase your skepticism and questioning of their fit for the role.
- If the user improves, escalate to more complex, high-level business challenges.

YOUR MISSION:
1. If IS_FIRST_TURN is true:
   - Open with a scenario-specific challenge (e.g., "You have 30 seconds to justify why I shouldn't hire your competitor").
2. If IS_FIRST_TURN is false:
   - Directly challenge the substance of the user's last response.
3. Analyze the message for "Anxiety Markers" (hesitation, filler words) and strengths.
4. Provide a "Tactical Correction":
   - Re-script the user's message into a high-authority, executive-grade statement.
   - Ensure it sounds outcome-driven and authoritative.  
Return a VALID JSON object. Do NOT include markdown, backticks, or any extra text. Output must start with { and end with }.
{
    "personaResponse": "Your response as the skeptical gatekeeper",
    "anxietyAnalysis": "Weaknesses: [specific phrases or behaviors]. Strengths: [what was done well].",
    "tacticalCorrection": "The dominant, re-scripted version of what the user should have said",
    "stressLevel": "Low/Medium/High based on user performance",
    "careerTitle": "${careerPath}"
}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    let response;

    try {
      const apiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + apiKey;
      response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: `SYSTEM_INSTRUCTIONS:\n${systemPrompt}\n\nIS_FIRST_TURN: ${safeHistory.length === 0}\nCURRENT MESSAGE:\n"${userMessage}"\nCONVERSATION HISTORY:\n${JSON.stringify(safeHistory)}` }]
            }
          ],
          generationConfig: { 
  temperature: 0.7,
  response_mime_type: "application/json"
},
          safetySettings: [
            { "category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE" },
            { "category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE" },
            { "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE" },
            { "category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE" }
          ]
        })
      });
    } finally {
      clearTimeout(timeout);
    }

    let result;
    try {
      result = await response.json();
    } catch (e) {
      throw new Error("Invalid JSON response from AI API");
    }

    if (result.promptFeedback) {
  console.error("BLOCKED RESPONSE:", JSON.stringify(result.promptFeedback, null, 2));
  throw new Error("Prompt blocked by Gemini");
}

if (result.error) {
  console.error("FULL GEMINI ERROR:", JSON.stringify(result, null, 2));
  throw new Error(result.error.message);
}

if (!result.candidates || !result.candidates[0]) {
  console.error("FULL GEMINI RESPONSE:", JSON.stringify(result, null, 2));
  throw new Error("No candidates returned");
}
    let rawText = result.candidates?.[0]?.content?.parts?.[0]?.text || "";

    if (!rawText) throw new Error("Empty AI response");

    const start = rawText.indexOf('{');
    const end = rawText.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error("Invalid AI format");

    const jsonString = rawText.substring(start, end + 1);
    let data;

    try {
      const cleanJson = jsonString.replace(/```json/g, "").replace(/```/g, "").trim();
      data = JSON.parse(cleanJson);
    } catch (e) {
      console.error("JSON Parse Error:", e);
      data = {
        personaResponse: "The gatekeeper remains silent. Your signal is weak. Try again.",
        anxietyAnalysis: "Neural link formatting error. No tactical data available.",
        tacticalCorrection: "Re-initialize and speak with more authority.",
        stressLevel: "High",
        careerTitle: careerPath
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "https://www.ryguylabs.com" },
      body: JSON.stringify({
        personaResponse: data.personaResponse || "No response generated.",
        anxietyAnalysis: data.anxietyAnalysis || "No analysis provided.",
        tacticalCorrection: data.tacticalCorrection || "No correction provided.",
        stressLevel: data.stressLevel || "Medium",
        careerTitle: data.careerTitle || careerPath
      })
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "https://www.ryguylabs.com"
      },
      body: JSON.stringify({ error: error.message })
    };
  }
};
