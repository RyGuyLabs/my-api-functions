const { GoogleGenerativeAI } = require('@google/generative-ai');

exports.handler = async (event) => {
    const corsHeaders = {
        'Access-Control-Allow-Origin': 'https://www.ryguylabs.com',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    };

    // Handle the preflight request for CORS
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: '',
        };
    }
    
    // This function will only process POST requests.
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Method Not Allowed' }),
        };
    }

    // Parse the request body
    const { leadData, criteria, includeDemographics } = JSON.parse(event.body);

    // Retrieve API keys from Netlify environment variables
    const GEMINI_API_KEY = process.env.FIRST_API_KEY;
    const GOOGLE_SEARCH_API_KEY = process.env.RYGUY_SEARCH_API_KEY;
    const GOOGLE_SEARCH_ENGINE_ID = process.env.RYGUY_SEARCH_ENGINE_ID;

    // Check if API keys are set
    if (!GEMINI_API_KEY || !GOOGLE_SEARCH_API_KEY || !GOOGLE_SEARCH_ENGINE_ID) {
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Server misconfiguration: API keys are not set.' }),
        };
    }

    try {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash-preview-05-20',
            tools: [{ "google_search": {} }]
        });

        // 1. Fetch real-time news using Google Custom Search
        let newsSnippet = 'No news found.';
        const companyName = leadData['lead-company'];
        
        try {
            const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_SEARCH_API_KEY}&cx=${GOOGLE_SEARCH_ENGINE_ID}&q=${encodeURIComponent(companyName + ' news')}`;
            const searchResponse = await fetch(searchUrl);
            const searchData = await searchResponse.json();

            if (searchData.items && searchData.items.length > 0) {
                // Take the snippet from the first search result
                newsSnippet = searchData.items[0].snippet;
            }
        } catch (e) {
            console.error('Error fetching news from Google Search:', e.message);
            // Fallback to "No news found." is handled by the initial variable declaration.
        }

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

        // Log the user query for debugging
        console.log('User Query:', userQuery);

        const result = await model.generateContent({
            contents: [{ parts: [{ text: userQuery }] }],
            // Use generationConfig to enforce a structured JSON response
            generationConfig: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: 'OBJECT',
                    properties: {
                        score: { type: 'NUMBER' },
                        category: { type: 'STRING' },
                        report: { type: 'STRING' },
                        news: { type: ['STRING', 'NULL'] },
                        predictiveInsight: { type: ['STRING', 'NULL'] },
                        outreachMessage: { type: 'STRING' },
                        discoveryQuestions: { type: 'STRING' }
                    },
                    required: ['score', 'category', 'report', 'outreachMessage', 'discoveryQuestions']
                }
            }
        });

        // Use .json() to parse the structured response directly
        const qualificationData = await result.response.json();
        
        // Log the structured AI response for debugging
        console.log('Structured AI Response:', qualificationData);

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify(qualificationData),
        };

    } catch (error) {
        // Log the full error to Netlify's backend for detailed debugging
        console.error('Error qualifying lead:', error.message, error.stack);
        
        // Return a more descriptive error to the frontend
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Failed to qualify lead.', details: error.message }),
        };
    }
};
