const { GoogleGenerativeAI } = require("@google/generative-ai");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { asset: careerPath } = JSON.parse(event.body);
    const apiKey = "FIRST_API_KEY"; // Environment provides this
    const genAI = new GoogleGenerativeAI(apiKey);
   
    // Using the 2.5 Flash model with search grounding enabled
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash-preview-09-2025",
      tools: [{ google_search: {} }]
    });

    const prompt = `
      PERFORM MARKET SCRAPE FOR: "${careerPath}"
     
      OBJECTIVE: Identify high-ROI arbitrage opportunities.
      1. Find current freelance/contract rates (Upwork, TopTal, Niche boards).
      2. Find underserved niche consulting gaps.
      3. identify "High-Ticket" specific tasks that pay a disproportionate hourly rate.
     
      OUTPUT REQUIREMENTS:
      - Ignore career satisfaction. Focus 100% on ROI.
      - Create a "Money-to-Task" matrix showing exactly how much specific tasks in this field pay right now.
     
      RETURN JSON ONLY:
      {
        "verdict": "e.g., HIGH EXPLOITATION POTENTIAL",
        "roi": "e.g., $250/hr average",
        "matrix": [
          {"task": "Specific Task Name", "value": "$ amount"},
          {"task": "Specific Task Name", "value": "$ amount"}
        ],
        "logistics": ["Market Gap 1", "Niche Opportunity 2"],
        "risks": ["Slippage risk", "Competition level"],
        "steps": ["Step 1 to execute", "Step 2 to execute"]
      }
    `;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
   
    // Extract JSON in case there's markdown wrapping
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    const cleanJson = jsonMatch ? jsonMatch[0] : responseText;

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: cleanJson,
    };
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Neural link timeout during market scrape." }),
    };
  }
};
