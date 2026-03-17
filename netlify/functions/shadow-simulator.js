// Netlify provides global fetch; node-fetch not required

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

  try {
    const { message, history, persona, careerPath } = event.body ? JSON.parse(event.body) : {};
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

// ✅ INPUT VALIDATION
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

YOUR MISSION:
1. Respond as this persona would, being firm and demanding. Begin with a dynamic opener reflecting the career and industry.
2. Analyze the user's message for "Anxiety Markers" (over-apologizing, "just," "I think," "sorry," hesitant phrasing) and also note strengths.
3. Provide a "Tactical Correction": Rewrite their message to be dominant, professional, and task-oriented, suited to the career and industry.
   
Return ONLY JSON:
{
    "personaResponse": "Your response as the skeptical gatekeeper",
    "anxietyAnalysis": "Identification of weaknesses and strengths in user phrasing",
    "tacticalCorrection": "The dominant, re-scripted version of what the user should have said",
    "stressLevel": "Low/Medium/High based on user performance",
    "careerTitle": "${careerPath}"  // Ensure returned for frontend storage
}`;
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
  parts: [{
    text: `
CURRENT MESSAGE:
"${message}"

CONVERSATION HISTORY:
${JSON.stringify(safeHistory)}
`
  }]
}],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { responseMimeType: "application/json", temperature: 0.9 }
      })
    });

    const result = await response.json();
    if (!result.candidates || !result.candidates[0]) throw new Error("No candidates returned");
    let rawText = result.candidates?.[0]?.content?.parts?.[0]?.text || "";

if (!rawText) throw new Error("Empty AI response");

// ✅ SAFE JSON EXTRACTION
const start = rawText.indexOf('{');
const end = rawText.lastIndexOf('}');
if (start === -1 || end === -1) throw new Error("Invalid AI format");

const jsonString = rawText.substring(start, end + 1);
const data = JSON.parse(jsonString);

    return {
  statusCode: 200,
  headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "https://www.ryguylabs.com" },
  body: JSON.stringify({
    personaResponse: data.personaResponse || "No response generated.",
    anxietyAnalysis: data.anxietyAnalysis || "No analysis provided.",
    tacticalCorrection: data.tacticalCorrection || "No correction provided.",
    stressLevel: data.stressLevel || "Medium"
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
