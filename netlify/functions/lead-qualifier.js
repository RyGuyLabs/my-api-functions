const { GoogleGenerativeAI } = require('@google/generative-ai');

exports.handler = async (event) => {
    // This function will only process POST requests.
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method Not Allowed' }),
        };
    }

    // Parse the request body
    const { leadData, criteria, includeDemographics } = JSON.parse(event.body);

    // Retrieve API keys from Netlify environment variables
    const GEMINI_API_KEY = process.env.FIRST_API_KEY;
    const GOOGLE_SEARCH_API_KEY = process.env.RYGUY_SEARCH_API_KEY;

    // Check if API keys are set
    if (!GEMINI_API_KEY || !GOOGLE_SEARCH_API_KEY) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Server misconfiguration: API keys are not set.' }),
        };
    }

    try {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash-preview-05-20',
            tools: [{ "google_search": {} }]
        });

        // Construct the prompt for the AI
        const systemPrompt = `You are an expert B2B sales development representative (SDR) and lead qualifier.
Your task is to analyze lead data against a set of custom criteria and generate a comprehensive qualification report.
The report should include:
- A qualification score out of 100.
- A category (e.g., "Highly Qualified", "Good Fit", "Needs Nurturing", "Not a Fit").
- A concise summary report justifying the score and category.
- A section with "Latest News" about the company, based on a Google search, if relevant.
- A section with "Predictive Insights" on the company's potential future needs.
- A draft of a personalized "Outreach Message" to the lead.
- A list of "Strategic Discovery Questions" to ask the lead.

Use the provided criteria to evaluate the lead's budget, timeline, and ideal customer profile (ICP).
The output MUST be a JSON object with the following structure:
{
  "score": number,
  "category": string,
  "report": string,
  "news": string | null,
  "predictiveInsight": string | null,
  "outreachMessage": string,
  "discoveryQuestions": string
}
If news is not found, set "news" to null.`;
        
        const userQuery = `
            Lead Data:
            ${JSON.stringify(leadData, null, 2)}

            My Custom Criteria:
            ${JSON.stringify(criteria, null, 2)}

            Include Demographic Insights: ${includeDemographics}
        `;

        const result = await model.generateContent({
            contents: [{ parts: [{ text: userQuery }] }],
            systemInstruction: {
                parts: [{ text: systemPrompt }]
            }
        });

        const responseText = result.response.text();
        const qualificationData = JSON.parse(responseText);

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(qualificationData),
        };

    } catch (error) {
        console.error('Error qualifying lead:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to qualify lead.', details: error.message }),
        };
    }
};
