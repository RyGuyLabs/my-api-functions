const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  // 1. Security & Method Check
  if (event.httpMethod !== "POST") {
	return {
    	statusCode: 405,
    	headers: { "Content-Type": "application/json" },
    	body: JSON.stringify({ error: "Method Not Allowed" })
	};
  }

  // 2. Parse User Input
  let body;
  try {
	body = JSON.parse(event.body);
  } catch (e) {
	return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON input" }) };
  }

  const { target, context: searchLogic, mode } = body;
  const apiKey = process.env.FIRST_API_KEY; 

  if (!apiKey) {
	return {
  	statusCode: 500,
  	body: JSON.stringify({ error: "Server Configuration Error: API Key missing." })
	};
  }

  const systemPrompt = `
	You are a high-level Social Intelligence & Negotiation Agent.
	The user wants to find 'LEVERAGE' over a specific target or niche.
   
	USER TARGET/NICHE: ${target}
	INTENT LOGIC: ${searchLogic}
   
	YOUR TASK:
	1. Use Google Search to find current (last 3-6 months) public complaints, news articles, or social media frustrations (Reddit/X) related to this target.
	2. Identify ONE specific "Bleeding Neck" pain point—a problem so urgent they can't ignore it.
	3. Generate a "No-Oriented" CTA (Chris Voss style). This CTA must allow the lead to say "No" to feel in control, while actually opening the door (e.g., "Is it a crazy idea to...").
	4. Provide 3 Negotiation Guardrails to help the user manage their social anxiety by following strict rules of interaction.
   
	OUTPUT FORMAT: You MUST return a valid JSON object with these exact keys:
	{
  	"pain_point": "string",
  	"cta": "string",
  	"rules": [{"title": "string", "description": "string"}]
	}
  `;

  const apiPayload = {
	contents: [{
    	role: "user",
    	parts: [{ text: systemPrompt }]
	}],
	tools: [{ "google_search": {} }], // Enables real-time social/news lookup
	generationConfig: {
  	responseMimeType: "application/json"
	}
  };

  // 4. Exponential Backoff Logic (Standard for high-reliability apps)
  const fetchWithRetry = async (url, options, maxRetries = 5) => {
	let delay = 1000;
	for (let i = 0; i < maxRetries; i++) {
  	try {
    	const response = await fetch(url, options);
    	if (response.ok) return await response.json();
       
    	// Retry on 429 (Rate Limit) or 500+ (Server Errors)
    	if (response.status === 429 || response.status >= 500) {
      	if (i === maxRetries - 1) throw new Error(`API failed after ${maxRetries} attempts.`);
      	await new Promise(resolve => setTimeout(resolve, delay));
      	delay *= 2; // Double the wait time for next try
      	continue;
    	}
       
    	const errorData = await response.json();
    	throw new Error(errorData.error?.message || "Unknown API Error");
  	} catch (err) {
    	if (i === maxRetries - 1) throw err;
    	await new Promise(resolve => setTimeout(resolve, delay));
    	delay *= 2;
  	}
	}
  };

  // 5. Execution
  try {
	const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
   
	const result = await fetchWithRetry(apiUrl, {
  	method: 'POST',
  	headers: { 'Content-Type': 'application/json' },
  	body: JSON.stringify(apiPayload)
	});

	// Extract the JSON string from the AI response
	const rawAiResponse = result.candidates?.[0]?.content?.parts?.[0]?.text;
   
	if (!rawAiResponse) {
    	throw new Error("Empty response from Intelligence Engine.");
	}

	const parsedResponse = JSON.parse(rawAiResponse);

	// 6. Return Clean Data to Squarespace Front-end
	return {
  	statusCode: 200,
  	headers: {
    	"Content-Type": "application/json",
    	"Access-Control-Allow-Origin": "*", // Required for cross-domain calls from Squarespace
    	"Access-Control-Allow-Headers": "Content-Type"
  	},
  	body: JSON.stringify(parsedResponse)
	};

  } catch (error) {
	console.error("Function Error:", error.message);
	return {
  	statusCode: 500,
  	headers: { "Access-Control-Allow-Origin": "*" },
  	body: JSON.stringify({
    	error: "Intelligence Engine Timeout",
    	message: "The search for leverage took too long or failed. Please try again."
  	})
	};
  }
};

