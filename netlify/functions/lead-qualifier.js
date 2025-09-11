const { GoogleGenerativeAI } = require('@google/generative-ai');

exports.handler = async (event) => {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*', // Adjust to your domain if needed
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    };

    // Handle preflight CORS request
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: '',
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Method Not Allowed' }),
        };
    }

    try {
        const { leadData, criteria, includeDemographics } = JSON.parse(event.body);

        const GEMINI_API_KEY = process.env.FIRST_API_KEY;
        const GOOGLE_SEARCH_API_KEY = process.env.RYGUY_SEARCH_API_KEY;
        const GOOGLE_SEARCH_ENGINE_ID = process.env.RYGUY_SEARCH_ENGINE_ID;

        if (!GEMINI_API_KEY || !GOOGLE_SEARCH_API_KEY || !GOOGLE_SEARCH_ENGINE_ID) {
            return {
                statusCode: 500,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Server misconfiguration: API keys are not set.' }),
            };
        }

        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash-preview-05-20',
            tools: [{ "google_search": {} }]
        });

        // --- 1. Fetch news snippet ---
        let newsSnippet = 'No news found.';
        const companyName = leadData.company || leadData['lead-company'] || null;

        if (companyName) {
            try {
                const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_SEARCH_API_KEY}&cx=${GOOGLE_SEARCH_ENGINE_ID}&q=${encodeURIComponent(companyName + ' news')}`;
                const searchResponse = await fetch(searchUrl);
                const searchData = await searchResponse.json();
                if (searchData.items && searchData.items.length > 0) {
                    const firstResult = searchData.items[0];
                    newsSnippet = `${firstResult.title}: ${firstResult.snippet} (Source: ${firstResult.link})`;
                }
            } catch (e) {
                console.error('Error fetching news:', e.message);
            }
        }

        // --- 2. Build AI query ---
        const userQuery = `
Analyze the following lead data against my custom criteria.

Lead Data:
${JSON.stringify(leadData, null, 2)}

My Custom Criteria:
${JSON.stringify(criteria, null, 2)}

Latest News Snippet:
${newsSnippet}

Include Demographic Insights: ${includeDemographics}
`;

        // --- 3. Generate AI qualification ---
        const result = await model.generateContent({
            contents: [{ parts: [{ text: userQuery }] }],
            generationConfig: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: 'OBJECT',
                    properties: {
                        score: { type: 'NUMBER' },
                        category: { type: 'STRING' },
                        report: { type: 'STRING' },
                        news: { type: 'STRING' },
                        predictiveInsight: { type: 'STRING' },
                        outreachMessage: { type: 'STRING' },
                        discoveryQuestions: { type: 'STRING' }
                    },
                    required: ['score', 'category', 'report', 'outreachMessage', 'discoveryQuestions']
                }
            }
        });

        const qualificationData = await result.response.json();

        // Include fetched news even if AI returned null
        qualificationData.news = qualificationData.news || newsSnippet;
        qualificationData.predictiveInsight = qualificationData.predictiveInsight || null;

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify(qualificationData),
        };

    } catch (error) {
        console.error('Error qualifying lead:', error.message, error.stack);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Failed to qualify lead.', details: error.message }),
        };
    }
};
