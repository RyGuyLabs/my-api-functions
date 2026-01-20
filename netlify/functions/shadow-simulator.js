const fetch = require('node-fetch');

exports.handler = async (event, context) => {
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
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { message, history, persona, careerPath } = JSON.parse(event.body);
    const apiKey = process.env.FIRST_API_KEY;

    const systemPrompt = `You are the "Shadow Execution Simulator."
    The user is training to overcome social anxiety and weak communication to enter the career path: ${careerPath}.
   
    YOUR PERSONA: You are a ${persona}. You are busy, skeptical, and unimpressed. You do not have time for "fluff" or "anxiety."
   
    YOUR MISSION:
    1. Respond as this persona would, being firm and demanding.
    2. Analyze the user's message for "Anxiety Markers" (over-apologizing, "just," "I think," "sorry," hesitant phrasing).
    3. Provide a "Tactical Correction": Rewrite their message to be dominant, professional, and task-oriented.
   
    Return ONLY JSON:
    {
        "personaResponse": "Your response as the skeptical gatekeeper",
        "anxietyAnalysis": "Identification of weak points in user phrasing",
        "tacticalCorrection": "The dominant, re-scripted version of what the user should have said",
        "stressLevel": "Low/Medium/High based on user performance"
    }`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `User says: "${message}". Context: ${JSON.stringify(history)}` }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { responseMimeType: "application/json", temperature: 0.9 }
      })
    });

    const result = await response.json();
    const data = JSON.parse(result.candidates[0].content.parts[0].text);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(data)
    };

  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
