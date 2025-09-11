// File: functions/lead-qualifier.js
const fetch = require('node-fetch');

// Helper: Check for required environment variables
const REQUIRED_ENV_VARS = [
  'FIRST_API_KEY', 
  'RYGUY_SEARCH_API_KEY', 
  'RYGUY_SEARCH_ENGINE_ID'
];

for (const key of REQUIRED_ENV_VARS) {
  if (!process.env[key]) {
    console.error(`Missing environment variable: ${key}`);
    throw new Error(`Server misconfiguration: ${key} is not set.`);
  }
}

const GEMINI_API_KEY = process.env.FIRST_API_KEY;
const SEARCH_API_KEY = process.env.RYGUY_SEARCH_API_KEY;
const SEARCH_ENGINE_ID = process.env.RYGUY_SEARCH_ENGINE_ID;

exports.handler = async function(event, context) {
  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: 'Method Not Allowed' })
      };
    }

    const body = JSON.parse(event.body);
    const { leadData, criteria = {}, includeDemographics = false } = body;

    if (!leadData || Object.keys(leadData).length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing lead data.' })
      };
    }

    // Fetch news snippet from Google Custom Search (optional)
    let newsSnippet = '';
    try {
      const searchQuery = encodeURIComponent(leadData['lead-company'] || '');
      const searchResponse = await fetch(`https://www.googleapis.com/customsearch/v1?key=${SEARCH_API_KEY}&cx=${SEARCH_ENGINE_ID}&q=${searchQuery}`);
      const searchData = await searchResponse.json();
      if (searchData.items && searchData.items.length > 0) {
        newsSnippet = searchData.items[0].snippet;
      }
    } catch (err) {
      console.error('Error fetching news snippet:', err);
    }

    // Build Gemini JSON payload correctly
    const geminiPayload = {
      prompt: `Analyze the following lead data against my custom criteria.

Lead Data:
${JSON.stringify(leadData, null, 2)}

My Custom Criteria:
${JSON.stringify(criteria, null, 2)}

Latest News Snippet:
${newsSnippet}

Include Demographic Insights: ${includeDemographics}

Provide a structured response with:
- category (High / Medium / Low)
- score (0-100)
- report (text)
- outreachMessage (optional)
- discoveryQuestions (optional)
- predictiveInsight (optional)
`,
      model: 'gemini-2.5-flash-preview-05-20',
      temperature: 0.2,
      maxOutputTokens: 800
    };

    const geminiResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GEMINI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(geminiPayload)
    });

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      console.error('Gemini API error:', errText);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to qualify lead.', details: errText })
      };
    }

    const geminiResult = await geminiResponse.json();

    // Extract content safely
    let contentText = '';
    if (geminiResult.candidates && geminiResult.candidates[0] && geminiResult.candidates[0].content) {
      const parts = geminiResult.candidates[0].content.parts || [];
      contentText = parts.join('\n');
    }

    // Attempt to parse structured JSON from text
    let structuredResult = {};
    try {
      structuredResult = JSON.parse(contentText);
    } catch (e) {
      structuredResult = {
        category: 'Unknown',
        score: 0,
        report: contentText,
        outreachMessage: '',
        discoveryQuestions: '',
        predictiveInsight: ''
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify(structuredResult)
    };

  } catch (err) {
    console.error('Unexpected server error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to qualify lead.', details: err.message })
    };
  }
};
