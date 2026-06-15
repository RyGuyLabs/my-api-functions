const requestLog = {};
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

// 🛡️ RATE LIMITING SYSTEM

const ip =
  event.headers["x-forwarded-for"] ||
  event.headers["client-ip"] ||
  "unknown";

const currentTime = Date.now();

const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 20;

if (!requestLog[ip]) {
  requestLog[ip] = [];
}

// Remove expired timestamps
requestLog[ip] = requestLog[ip].filter(
  timestamp => currentTime - timestamp < WINDOW_MS
);

// Block excessive requests
if (requestLog[ip].length >= MAX_REQUESTS) {

  return {
    statusCode: 429,

    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": accessControlOrigin
    },

    body: JSON.stringify({
      error: "Too many requests. Slow down."
    })
  };
}

// Log current request
requestLog[ip].push(currentTime);
  
  try {

    // 🛡️ PRODUCTION SAFEGUARD: Payload Size Limit
    if (event.body && event.body.length > 15000) {
      return { statusCode: 413, headers, body: JSON.stringify({ error: "Request entity too large." }) };
    }

    const body = event.body ? (typeof event.body === 'string' ? JSON.parse(event.body) : event.body) : {};
    const message = body.message || "";
    // 🛡️ INPUT LENGTH GUARD (token protection lite)
const MAX_INPUT_CHARS = 4000;

if (message.length > MAX_INPUT_CHARS) {
  return {
    statusCode: 413,
    headers,
    body: JSON.stringify({
      error: "Input too long. Please shorten your response."
    })
  };
}
    const history = Array.isArray(body.history) ? body.history : [];
    const persona = body.persona || "Aggressive CEO";
    const careerPath = body.careerPath || "Professional";
    const industry = body.industry || "General";    

    const previousPerformanceScore = body.previousPerformanceScore || 50;

    if (!persona || typeof persona !== "string") {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": accessControlOrigin },
        body: JSON.stringify({ error: "Invalid persona" })
      };
    }

    if (!careerPath || typeof careerPath !== "string") {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": accessControlOrigin },
        body: JSON.stringify({ error: "Invalid career path" })
      };
    }

    if (!industry || typeof industry !== "string") {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": accessControlOrigin },
        body: JSON.stringify({ error: "Invalid industry" })
      };
    }

    if (!message || typeof message !== "string") {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": accessControlOrigin },
        body: JSON.stringify({ error: "Invalid message input" })
      };
    }

    if (!Array.isArray(history)) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": accessControlOrigin },
        body: JSON.stringify({ error: "Invalid history format" })
      };
    }

    const apiKey = process.env.SHADOW_SIM_KEY;
    if (!apiKey) throw new Error("Missing SHADOW_SIM_KEY");

    const safeHistory = Array.isArray(history) ? history.slice(-8) : [];
    
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
    
    const systemPrompt = `You are the "Shadow Execution Simulator" by RyGuyLabs.
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

ADAPTIVE PERFORMANCE SYSTEM:

Current User Performance Score:
${previousPerformanceScore}

BEHAVIOR RULES:

If score is 0–40:
- Apply high pressure
- Interrupt weak logic
- Challenge confidence aggressively

If score is 41–75:
- Maintain skeptical executive tone
- Probe for weaknesses

If score is 76–100:
- Treat user as high-level candidate
- Introduce strategic complexity

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
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;
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
            temperature: 0.8,
            responseMimeType: "application/json" // Note: camelCase is required for 2026 API
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
      console.error("BLOCKED RESPONSE:", result.promptFeedback.blockReason); // 🛡️ SECURE LOG
      throw new Error("Prompt blocked by Gemini");
    }

    if (result.error) {
      console.error("Gemini API Error:", result.error.message); // 🛡️ SECURE LOG
      throw new Error(result.error.message);
    }

    if (!result.candidates || !result.candidates[0]) {
      console.error("AI Error: No candidates returned"); // 🛡️ SECURE LOG
      throw new Error("No candidates returned");
    }

    let rawText = result.candidates[0].content.parts[0].text || "";

    if (!rawText) throw new Error("Empty AI response");

    const start = rawText.indexOf('{');
    const end = rawText.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error("Invalid AI format");

const jsonString = rawText.substring(start, end + 1);

let data;

try {

  const cleanJson = jsonString
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();

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

// 🧠 BEHAVIORAL INTELLIGENCE SCORES

const confidence = calculateConfidence(
  data.personaResponse || ""
);

const clarity = calculateClarity(
  data.personaResponse || ""
);

const pressureResistance = calculatePressureResistance(
  data.anxietyAnalysis || ""
);

const authoritySignal = calculateAuthoritySignal(
  data.tacticalCorrection || ""
);

const hesitationIndex = calculateHesitationIndex(
  data.anxietyAnalysis || ""
);

// 🧠 MASTER PERFORMANCE SCORE

const performanceScore = Math.round(
  (
    confidence +
    clarity +
    pressureResistance +
    authoritySignal -
    hesitationIndex
  ) / 4
);

// ✅ SUCCESS RESPONSE

return {

  statusCode: 200,

  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": accessControlOrigin
  },

  body: JSON.stringify({

    personaResponse:
      data.personaResponse || "No response generated.",

    anxietyAnalysis:
      data.anxietyAnalysis || "No analysis provided.",

    tacticalCorrection:
      data.tacticalCorrection || "No correction provided.",

    stressLevel:
      data.stressLevel || "Medium",

    careerTitle:
      data.careerTitle || careerPath,

    confidence,
    clarity,
    pressureResistance,
    authoritySignal,
    hesitationIndex,

    performanceScore

  })

};

} catch (error) {
    console.error("Backend Error:", error.message); // 🛡️ SECURE LOG
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": accessControlOrigin
      },
      body: JSON.stringify({ error: "Service temporarily unavailable. Re-establish link." })
    };
  }
};

function clamp(value) {
  return Math.max(0, Math.min(100, value));
}

function calculateConfidence(text) {
  let score = 50;

  if (text.length > 120) score += 10;
  if (!text.includes("maybe")) score += 10;
  if (!text.includes("uncertain")) score += 10;
  if (text.includes("weak")) score -= 15;

  return clamp(score);
}

function calculateClarity(text) {
  let score = 50;

  if (text.length < 200) score += 10;
  if (!text.includes("...")) score += 5;
  if (text.split(" ").length < 60) score += 10;

  return clamp(score);
}

function calculatePressureResistance(text) {
  let score = 50;

  if (!text.includes("hesitant")) score += 10;
  if (!text.includes("uncertain")) score += 10;
  if (text.includes("challenge")) score += 5;

  return clamp(score);
}

function calculateAuthoritySignal(text) {
  let score = 50;

  if (text.includes("must")) score += 10;
  if (text.includes("will")) score += 10;
  if (text.includes("should")) score -= 5;

  return clamp(score);
}

function calculateHesitationIndex(text) {
  let score = 50;

  if (text.includes("maybe")) score += 10;
  if (text.includes("I think")) score += 10;
  if (text.includes("not sure")) score += 15;

  return clamp(score);
}
