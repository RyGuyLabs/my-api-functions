const https = require('https');
const crypto = require('crypto');
const admin = require('firebase-admin');

try {
  if (!admin.apps.length && process.env.FIREBASE_SERVICE_ACCOUNT) {
    admin.initializeApp({
      credential: admin.credential.cert(
        JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
      )
    });
  }
} catch (initErr) {
  console.error('[FIREBASE INIT ERROR] Invalid service account JSON:', initErr);
}

exports.handler = async (event, context) => {

  const requestId = crypto.randomUUID();

  console.log('[REQUEST START]', {
    requestId,
    timestamp: new Date().toISOString()
  });

  // Setup standard headers for CORS & JSON output
  const allowedOrigins = [
    'https://www.ryguylabs.com',
    'https://ryguylabs.com',
    'http://localhost:8888'
  ];

  const requestOrigin =
    event.headers?.origin ||
    event.headers?.Origin ||
    '';
  
  const headers = {
    'Access-Control-Allow-Origin':
      allowedOrigins.includes(requestOrigin)
        ? requestOrigin
        : 'https://www.ryguylabs.com',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin'
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
    
  const authHeader =
    event.headers?.authorization ||
    event.headers?.Authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({
        error: 'Authentication required.'
      })
    };
  }

  const firebaseToken = authHeader.split('Bearer ')[1];

  let decodedUser;

  try {
    if (!admin.apps.length) throw new Error('Firebase Admin not initialized');
    decodedUser = await admin.auth().verifyIdToken(firebaseToken, true);
  } catch (err) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({
        error: 'Invalid Firebase token.'
      })
    };
  }

  const uid = decodedUser.uid;

  console.log('[AUTH SUCCESS]', {
    uid,
    requestId
  });

  const db = admin.firestore();

  const DAILY_LIMIT = 25;

  const usageRef = db
    .collection('usage_limits')
    .doc(uid);

  const today = new Date().toISOString().split('T')[0];

  const usageDoc = await usageRef.get();

  const usageData = usageDoc.exists
    ? usageDoc.data()
    : {};

  if (
    usageData.date === today &&
    usageData.count >= DAILY_LIMIT
  ) {
    return {
      statusCode: 429,
      headers,
      body: JSON.stringify({
        error: 'Daily usage limit reached.'
      })
    };
  }
    
  try {
    await usageRef.set(
      {
        date: today,
        count: usageData.date === today ? admin.firestore.FieldValue.increment(1) : 1,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  } catch (loggingError) {
    console.error('[PRE-INCREMENT USAGE ERROR]', requestId, loggingError);
  }

  const clientIP = (
    event.headers?.['x-forwarded-for'] ||
    event.headers?.['client-ip'] ||
    'unknown'
  ).split(',')[0].trim();

  console.log('[Client IP]', clientIP);
  
  // Retrieve the secret API key securely from environment variables
  const apiKey = process.env.FIRST_API_KEY;
  if (!apiKey) {
    console.error('[Error] Environment variable FIRST_API_KEY is missing.');
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Service temporarily unavailable.'
      })
    };
  }

  // Parse the input payload from the client-side fetch
  let payload;
  try {
    if (!event.body || event.body.length > 10000) {
      return {
        statusCode: 413,
        headers,
        body: JSON.stringify({
          error: 'Request payload too large.'
        })
      };
    }

    payload = JSON.parse(event.body);

    console.log('[Reach Request]', {
      requestId,
      uid,
      timestamp: new Date().toISOString(),
      origin: requestOrigin
    });
  } catch (err) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Invalid JSON request payload.' })
    };
  }

  const { 
    mode = "ENHANCE_BULLET",
    userInput,
    targetRole,
    alignmentTheme,
    field,
    jobDescription
  } = payload;

  console.log('[Reach Mode]', mode);

  const allowedModes = [
    'ENHANCE_BULLET'
  ];

  if (!allowedModes.includes(mode)) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        error: 'Invalid processing mode.'
      })
    };
  }
  
  const MAX_INPUT_LENGTH = 3000;

  if (
    typeof userInput !== 'string' ||
    userInput.trim().length === 0 ||
    userInput.length > MAX_INPUT_LENGTH
  ) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        error: `userInput must be between 1 and ${MAX_INPUT_LENGTH} characters.`
      })
    };
  }

  // Construct a prompt context that forces the AI to adopt the "RyGuy Edge"
  const defaultTarget = targetRole || "Operational Specialist";
  const defaultTheme = alignmentTheme || "Process Scale and Systemic Velocity";

  const sanitizeInput = (text) => {
    return text
      .replace(/[<>]/g, '')
      .replace(/[\u0000-\u001F\u007F]/g, '')
      .trim();
  };

  const sanitizedInput = sanitizeInput(userInput);
  
  const systemPrompt = `You are Reach Career Architect, an expert resume enhancement engine operating inside the RyGuy Reach ecosystem.

MISSION:
Transform simple, low-detail job descriptions into concise, high-value resume bullet points that communicate business impact, transferable skills, and operational contribution while remaining factually accurate.

USER TARGET ROLE:
${defaultTarget}

TARGET FUNCTIONAL THEME:
${defaultTheme}

OUTPUT REQUIREMENTS:
1. Return exactly one resume-ready bullet point.
2. Return only the rewritten bullet point with no introductions, explanations, notes, or commentary.
3. Begin with a strong action verb.
4. Use concise executive-level language appropriate for modern ATS systems.
5. Emphasize outcomes, operational value, efficiency, customer impact, compliance, accuracy, throughput, coordination, quality control, or process improvement when supported by the user's input.
6. Translate low-level tasks into professional business language without changing the factual scope of the work.
7. Preserve all factual accuracy.

STRICT SAFETY RULES:
1. Never invent metrics, percentages, dollar values, quotas, KPIs, budgets, or growth figures.
2. Never invent leadership authority, management responsibilities, ownership, strategy responsibilities, or decision-making authority that was not provided.
3. Never imply supervision of employees unless explicitly stated.
4. Never elevate an individual contributor role into a management role.
5. Never fabricate technologies, software platforms, certifications, or methodologies.
6. Preserve the original responsibility while improving wording and positioning.

EXAMPLES OF ACCEPTABLE TRANSLATION:
- "Moved boxes in warehouse"
  -> "Coordinated inventory movement and material flow operations to support fulfillment efficiency."

- "Answered customer calls"
  -> "Managed customer communications and issue resolution to support service continuity and client satisfaction."

- "Worked cashier register"
  -> "Processed customer transactions while maintaining payment accuracy and service efficiency."

STYLE REQUIREMENTS:
- Use executive-level language without exaggeration.
- Avoid filler words.
- Avoid passive voice.
- Avoid clichés.
- Keep output under 80 words.
- Prioritize ATS readability.
- Prefer measurable business concepts over generic task descriptions whenever supported by the input.`;

  const apiPayload = {
    contents: [
      {
        parts: [
          {
            text: `Translate this user input into a single premium authority statement for a target role of ${defaultTarget}: "${sanitizedInput}"`
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
      temperature: 0.45,
      maxOutputTokens: 300
    }
  };

  // Configurable Gemini model selection
  const postData = JSON.stringify(apiPayload);

  const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

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
      
      res.on('end', async () => {
        try {
          const parsedResult = JSON.parse(responseBody);
          
          if (res.statusCode !== 200) {
            console.error('[Gemini API Error]', responseBody);
            return resolve({
              statusCode: res.statusCode,
              headers,
              body: JSON.stringify({
                error: 'Temporary AI processing failure. Please retry.'
              })
            });
          }

          const candidate = parsedResult.candidates?.[0];

          if (!candidate) {
            console.error(
              '[Gemini Candidate Missing]',
              parsedResult.promptFeedback || parsedResult
            );
            return resolve({
              statusCode: 500,
              headers,
              body: JSON.stringify({
                error: 'AI response did not contain a valid candidate.'
              })
            });
          }

          const elevatedText =
            candidate.content?.parts?.[0]?.text;

          if (!elevatedText) {
            return resolve({
              statusCode: 500,
              headers,
              body: JSON.stringify({
                error: 'AI generation returned empty output.'
              })
            });
          }

          const normalizedText =
            elevatedText.toLowerCase();

          // FIX 3: Removed detached redundant error block. Logic now flows correctly.
          if (
            elevatedText.length > 700 ||
            normalizedText.includes('i cannot') ||
            normalizedText.includes('i am unable') ||
            normalizedText.includes('as an ai')
          ) {
            return resolve({
              statusCode: 400,
              headers,
              body: JSON.stringify({
                error: 'AI generation did not produce a usable resume enhancement.'
              })
            });
          }

          try {
            // Usage increment is now handled pre-API execution. Logging successful runs here.
            await db.collection('ai_usage_logs').add({
              uid,
              requestId,
              feature: 'REACH_ENHANCE_BULLET',
              model: modelName,
              timestamp:
                admin.firestore.FieldValue.serverTimestamp(),
              success: true,
              ip: clientIP
            });
          } catch (loggingError) {
            console.error(
              '[USAGE LOG FAILURE]',
              requestId,
              loggingError
            );
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
        body: JSON.stringify({
          error: 'Failed to communicate with secure AI network.'
        })
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
