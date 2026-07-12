const https = require('https');

exports.handler = async (event, context) => {
  // Setup standard headers for CORS & JSON output
  const headers = {
    'Access-Control-Allow-Origin': '*', // Allows calls from any local frontend dev or netlify domains
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'Vary': 'Origin'
  };

  // Handle preflight OPTIONS requests immediately
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'Preflight OK' })
    };
  }

  // Restrict requests only to secure POST submissions
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed. Use POST.' })
    };
  }

  // Retrieve the secret API key securely from environment variables
  const apiKey = process.env.FIRST_API_KEY;
  if (!apiKey) {
    console.error('[Error] Environment variable FIRST_API_KEY is missing.');
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Backend Configuration Error: FIRST_API_KEY is not defined in environment variables.' 
      })
    };
  }

  // Parse the input payload from the client-side fetch
  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (err) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Invalid JSON request payload.' })
    };
  }

  const { userInput, targetRole, alignmentTheme, field } = payload;

  if (!userInput) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Missing field: userInput is required.' })
    };
  }

  // Construct a prompt context that forces the AI to adopt the "RyGuy Edge"
  const defaultTarget = targetRole || "Operational Specialist";
  const defaultTheme = alignmentTheme || "Process Scale and Systemic Velocity";

  const systemPrompt = `You are the Reach Career Architect, a high-authority diagnostic engine built within the RyGuy Reach ecosystem. 
Your ultimate function is to take raw, low-confidence, plain-English labor summaries and elevate them into bullet points that reflect executive authority, fiscal value, and structural impact.

USER TARGET PATH: ${defaultTarget}
DEPARTMENT THEME: ${defaultTheme}

RULES FOR WRITING:
1. Strip all passive language (e.g. "Responsible for", "Worked on", "Helped with").
2. Begin every bullet point with an aggressive, forward-moving action verb (e.g. "Architected", "Engineered", "Orchestrated", "Catalyzed").
3. Connect the action directly to a systemic project or friction solved, and append a plausible, quantified result (e.g. "optimizing system scale by 24%", "saving 12 hours of weekly operational friction").
4. Translate basic terminology into high-tier metrics:
   - "Warehouse loading/Moving boxes" -> "Logistical operations, resource throughput, and flow mechanics."
   - "Answering calls/Customer service" -> "Routing vital stakeholder signals and strategic communication delivery."
   - "Retail/Cashier" -> "Direct capital processing and transaction audits."
5. Return ONLY the elevated text. Do not provide greetings, conversation, or placeholders. Speak in the third person or direct bullet-point active voice.`;

  // Set up the API payload structure for the Gemini model
  const apiPayload = {
    contents: [
      {
        parts: [
          {
            text: `Translate this user input into a single premium authority statement for a target role of ${defaultTarget}: "${userInput}"`
          }
        ]
      }
    ],
    systemInstruction: {
      parts: [
        {
          text: systemPrompt
        }
      ]
    },
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 256
    }
  };

  // Configurable Gemini model selection
const postData = JSON.stringify(apiPayload);

const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  return new Promise((resolve) => {
    const req = https.request(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 10000 // 10-second timeout guard
    }, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => { responseBody += chunk; });
      
      res.on('end', () => {
        try {
          const parsedResult = JSON.parse(responseBody);
          
          if (res.statusCode !== 200) {
            console.error('[Gemini API Error]', responseBody);
            return resolve({
              statusCode: res.statusCode,
              headers,
              body: JSON.stringify({ 
                error: 'Upstream Model Failure', 
                details: parsedResult.error?.message || 'Unknown API Exception' 
              })
            });
          }

          // Extract the generated text from Gemini's response structure
          const elevatedText = parsedResult.candidates?.[0]?.content?.parts?.[0]?.text;
          
          if (!elevatedText) {
            throw new Error('API returned an empty content candidate structure.');
          }

          resolve({
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
              elevatedText: elevatedText.trim(),
              status: 'success'
            })
          });

        } catch (err) {
          console.error('[Parsing Error]', err);
          resolve({
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to process upstream AI model response.' })
          });
        }
      });
    });

    req.on('error', (err) => {
      console.error('[Request Connection Error]', err);
      resolve({
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Failed to communicate with secure AI network.', details: err.message })
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        statusCode: 504,
        headers,
        body: JSON.stringify({ error: 'Gateway Timeout: Core processing engine timed out.' })
      });
    });

    req.write(postData);
    req.end();
  });
};
