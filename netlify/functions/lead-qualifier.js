const fetch = require('node-fetch');

const GEMINI_API_KEY = process.env.FIRST_API_KEY;
const GOOGLE_SEARCH_API_KEY = process.env.RYGUY_SEARCH_API_KEY;
const GOOGLE_CSE_ID = process.env.RYGUY_SEARCH_ENGINE_ID;

exports.handler = async function(event, context) {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const body = JSON.parse(event.body);

    const leadData = body.leadData || {};
    const includeDemographics = body.includeDemographics || false;
    const criteria = body.criteria || "No criteria provided";

    // Fetch latest news snippet via Google Programmable Search
    let newsSnippet = '';
    if (GOOGLE_SEARCH_API_KEY && GOOGLE_CSE_ID) {
      try {
        const searchResponse = await fetch(
          `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(leadData.leadCompany || '')}&key=${GOOGLE_SEARCH_API_KEY}&cx=${GOOGLE_CSE_ID}`
        );
        const searchResults = await searchResponse.json();
        if (searchResults.items && searchResults.items.length > 0) {
          newsSnippet = searchResults.items[0].snippet;
        }
      } catch(err) {
        console.error("Error fetching news snippet:", err);
        newsSnippet = '';
      }
    }

    // Build Gemini prompt
    const prompt = `
Analyze the following lead information in detail and provide clear sections in Title Case:

Lead Information:
- Name: ${leadData.leadName || 'N/A'}
- Company: ${leadData.leadCompany || 'N/A'}
- Budget: ${leadData.leadBudget || 'N/A'}
- Timeline: ${leadData.leadTimeline || 'N/A'}
- Needs: ${leadData.leadNeeds || 'N/A'}
- Custom Criteria: ${criteria}

Include:
1. Lead Analysis against the criteria
2. Demographic Insights (if ${includeDemographics})
3. Integration with Latest News Snippet:
"${newsSnippet}"
4. Predictive Engagement Insights
5. Suggested Outreach Strategies
6. 6-10 Strategic Discovery Questions tailored to this lead

Return a JSON object with keys:
{
  "report": "...",
  "news": "...",
  "predictive": "...",
  "outreach": "...",
  "questions": "..."
}
Ensure all section headers are capitalized properly.
`;

    // Call Gemini API
    const geminiResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GEMINI_API_KEY}`
      },
      body: JSON.stringify({
        prompt: prompt,
        temperature: 0.7,
        maxOutputTokens: 1000
      })
    });

    const geminiData = await geminiResponse.json();
    let content = '';

    if (geminiData.candidates && geminiData.candidates.length > 0) {
      content = geminiData.candidates[0].content?.[0]?.text || '';
    }

    // Basic parsing of sections from Gemini response
    const extractSection = (title) => {
      const regex = new RegExp(`${title}:([\\s\\S]*?)(?=\\n[A-Z][a-zA-Z ]+:|$)`, 'i');
      const match = content.match(regex);
      return match ? match[1].trim() : '';
    };

    const responseBody = {
      report: extractSection('Lead Analysis') || 'No report generated',
      news: extractSection('Integration with Latest News Snippet') || newsSnippet || '',
      predictive: extractSection('Predictive Engagement Insights') || 'Predictive engagement insights go here.',
      outreach: extractSection('Suggested Outreach Strategies') || 'Suggested outreach strategies go here.',
      questions: extractSection('Strategic Discovery Questions') || 'Strategic discovery questions go here.'
    };

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
      },
      body: JSON.stringify(responseBody)
    };

  } catch (error) {
    console.error("Unexpected server error:", error);
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
      },
      body: JSON.stringify({ error: error.message })
    };
  }
};
