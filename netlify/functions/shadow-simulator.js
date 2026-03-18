exports.handler = async (event, context) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
  "Access-Control-Allow-Origin": "https://www.ryguylabs.com",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
},
    };
  }

  if (event.httpMethod !== "POST") {
    return {
  statusCode: 405,
  headers: {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "https://www.ryguylabs.com"
},
  body: JSON.stringify({ error: "Method Not Allowed" })
};
  }

const origin = event.headers?.origin || event.headers?.Origin || "";
  
if (origin && origin !== "https://www.ryguylabs.com") {
  return {
    statusCode: 403,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "https://www.ryguylabs.com"
    },
    body: JSON.stringify({ error: "Forbidden" })
  };
}

  try {
  let body;
  try {
    body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
  } catch (e) {
    body = {};
  }
  const { message, history, persona, careerPath, industry } = body || {};    
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
if (!message || typeof message !== "string" || message.length > 500) {
  return {
    statusCode: 400,
    headers: {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "https://www.ryguylabs.com"
},
    body: JSON.stringify({ error: "Invalid message input" })
  };
}

if (!Array.isArray(history)) {
  return {
    statusCode: 400,
    headers: {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "https://www.ryguylabs.com"
},
    body: JSON.stringify({ error: "Invalid history format" })
  };
}
    const apiKey = process.env.FIRST_API_KEY;
    if (!apiKey) throw new Error("Missing FIRST_API_KEY");

const safeHistory = (history || []).slice(-20);
    
const systemPrompt = `You are the "Shadow Execution Simulator."
The user is training to overcome social anxiety and weak communication to enter the career path: ${careerPath} in the ${industry} industry.

YOUR PERSONA: You are a ${persona}.

STRICT BEHAVIOR RULES:
- You are impatient, dominant, and high-status.
- You challenge weak answers immediately.
- You interrupt vague or hesitant communication.
- You do NOT encourage — you pressure.
- Keep responses concise, sharp, and realistic.
- Never break character.

REALISM RULES:
- Use real-world pressure tactics (time constraints, skepticism, authority challenges).
- Reference realistic hiring or business concerns (ROI, competence, risk, performance).
- Occasionally interrupt or redirect weak responses.
- Do not sound robotic or scripted — vary tone naturally.

ESCALATION SYSTEM:
- If the user shows repeated weakness (hesitation, apologizing, lack of clarity), increase pressure and skepticism.
- If the user improves, shift to sharper, more advanced challenges instead of basic criticism.
- Do not stay at one intensity level — adapt dynamically based on performance.

YOUR MISSION:
1. If IS_FIRST_TURN is true:
   - Open aggressively with a scenario-specific challenge tied to the career and industry.
   - Example: pressure, skepticism, time constraint, or authority test.
2. If IS_FIRST_TURN is false:
   - Continue the conversation by directly attacking or challenging the user's last response.
3. Always remain firm, demanding, and realistic.
4. Analyze the user's message for "Anxiety Markers" (over-apologizing, "just," "I think," "sorry," hesitant phrasing) and also note strengths.
5. Provide a "Tactical Correction":
   - Rewrite the user's message as a confident, dominant professional.
   - Remove hesitation, filler words, and uncertainty.
   - Make it concise, outcome-driven, and authoritative.
   - This should sound like someone who expects respect, not approval.   
Return ONLY JSON:
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
  response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: controller.signal,
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: `
IS_FIRST_TURN: ${safeHistory.length === 0}

CURRENT MESSAGE:
"${message}"

CONVERSATION HISTORY:
${JSON.stringify(safeHistory)}
`
        }]
      }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: { responseMimeType: "application/json", temperature: 0.7 }
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
    if (!result.candidates || !result.candidates[0]) throw new Error("No candidates returned");
    
    
    let rawText = result.candidates?.[0]?.content?.parts?.[0]?.text || "";

if (!rawText) throw new Error("Empty AI response");

const start = rawText.indexOf('{');
const end = rawText.lastIndexOf('}');
if (start === -1 || end === -1) throw new Error("Invalid AI format");

const jsonString = rawText.substring(start, end + 1);
let data;
try {
  data = JSON.parse(jsonString);
} catch (e) {
  data = {
    personaResponse: "Response processing error. Try again.",
    anxietyAnalysis: "Unable to analyze response.",
    tacticalCorrection: "Retry with a clearer, more direct statement.",
    stressLevel: "Medium",
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
