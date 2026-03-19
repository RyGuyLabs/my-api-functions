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
    const body = event.body ? (typeof event.body === 'string' ? JSON.parse(event.body) : event.body) : {};
    const message = body.message || "";
    const history = Array.isArray(body.history) ? body.history : [];
    const persona = body.persona || "Aggressive CEO";
    const careerPath = body.careerPath || "Professional";
    const industry = body.industry || "General";    

    if (!persona || typeof persona !== "string") {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "https://www.ryguylabs.com" },
        body: JSON.stringify({ error: "Invalid persona" })
      };
    }

    if (!careerPath || typeof careerPath !== "string") {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "https://www.ryguylabs.com" },
        body: JSON.stringify({ error: "Invalid career path" })
      };
    }

    if (!industry || typeof industry !== "string") {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "https://www.ryguylabs.com" },
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

    const apiKey = process.env.FIRST_API_KEY;
    if (!apiKey) throw new Error("Missing FIRST_API_KEY");

    const safeHistory = Array.isArray(history) ? history.slice(-20) : [];
    
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
2. If IS_FIRST_TURN is false:
   - Continue the conversation by directly attacking or challenging the user's last response.
3. Return ONLY JSON:
{
    "personaResponse": "Your response as the skeptical gatekeeper",
    "anxietyAnalysis": "Weaknesses: [specific phrases]. Strengths: [what was done well].",
    "tacticalCorrection": "The dominant version of what the user should have said",
    "stressLevel": "Low/Medium/High",
    "careerTitle": "${careerPath}"
}`;
    
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: `SYSTEM_INSTRUCTION: ${systemPrompt}\n\nIS_FIRST_TURN: ${safeHistory.length === 0}\nCURRENT MESSAGE: "${message}"\nCONVERSATION HISTORY: ${JSON.stringify(safeHistory)}` }]
          }
        ],
        generationConfig: { 
          responseMimeType: "application/json", 
          temperature: 0.8 
        },
        safetySettings: [
          { "category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE" },
          { "category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE" },
          { "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE" },
          { "category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE" }
        ]
      })
    });

    const result = await response.json();
    
    // Check for specific API error messages
    if (result.error) throw new Error(`Google API Error: ${result.error.message}`);
    if (!result.candidates || !result.candidates[0]) throw new Error("No candidates returned from Google AI");
    
    let rawText = result.candidates[0].content.parts[0].text || "";
    const start = rawText.indexOf('{');
    const end = rawText.lastIndexOf('}');
    const data = JSON.parse(rawText.substring(start, end + 1).replace(/```json/g, "").replace(/```/g, "").trim());

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "https://www.ryguylabs.com" },
      body: JSON.stringify({
        personaResponse: data.personaResponse || "The gatekeeper is silent.",
        anxietyAnalysis: data.anxietyAnalysis || "No analysis.",
        tacticalCorrection: data.tacticalCorrection || "No correction.",
        stressLevel: data.stressLevel || "Medium",
        careerTitle: data.careerTitle || careerPath
      })
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "https://www.ryguylabs.com" },
      body: JSON.stringify({ error: error.message })
    };
  }
};
