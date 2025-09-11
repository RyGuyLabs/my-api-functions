const { GoogleGenerativeAI } = require('@google/generative-ai');

exports.handler = async (event, context) => {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const geminiApiKey = process.env.FIRST_API_KEY;
    const searchApiKey = process.env.RYGUY_SEARCH_API_KEY;

    if (!geminiApiKey) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Gemini API key not found in environment variables.' }),
        };
    }
    if (!searchApiKey) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Google Search API key not found in environment variables.' }),
        };
    }

    const MAX_RETRIES = 3;
    const initialDelay = 1000;

    const fetchWithRetry = async (url, options, retries = 0) => {
        try {
            const response = await fetch(url, options);
            if (response.status === 429 && retries < MAX_RETRIES) {
                const delay = initialDelay * Math.pow(2, retries);
                await new Promise(resolve => setTimeout(resolve, delay));
                return fetchWithRetry(url, options, retries + 1);
            }
            if (!response.ok) {
                throw new Error(`API call failed with status ${response.status}`);
            }
            return response;
        } catch (error) {
            if (retries < MAX_RETRIES) {
                const delay = initialDelay * Math.pow(2, retries);
                await new Promise(resolve => setTimeout(resolve, delay));
                return fetchWithRetry(url, options, retries + 1);
            }
            throw error;
        }
    };

    try {
        const body = JSON.parse(event.body);
        const { company, budget, timeline, specificNeeds } = body;

        if (!company) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Company name is required.' }),
            };
        }

        const genAI = new GoogleGenerativeAI(geminiApiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

        const cacheBuster = Math.random();

        // --- API Call 1: Get Predictive Insights from Gemini ---
        // This is a separate call to get structured data without the search tool.
        const insightsPrompt = `Act as a professional sales analyst. Based on the following lead information, provide a qualification score (1-100), a concise summary of key findings, and a brief, professional, and punchy outreach message draft with a clear, motivational call to action.\n\nCompany: ${company}\nBudget: ${budget}\nTimeline: ${timeline}\nSpecific Needs: ${specificNeeds}\n\nCache Buster: ${cacheBuster}`;

        const insightsPayload = {
            contents: [{ parts: [{ text: insightsPrompt }] }],
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        "score": { "type": "NUMBER", "description": "Score from 0 to 100" },
                        "report": { "type": "STRING", "description": "A detailed qualification report" },
                        "outreachMessage": { "type": "STRING", "description": "A personalized outreach message draft" }
                    },
                    "propertyOrdering": ["score", "report", "outreachMessage"]
                }
            },
        };

        let insightsResponse = {
            score: 0,
            report: 'Failed to generate predictive insights.',
            outreachMessage: 'Failed to generate outreach message.'
        };
        try {
            const result = await model.generateContent(insightsPayload);
            const text = result.response.text();
            insightsResponse = JSON.parse(text);
        } catch (e) {
            console.error('Error fetching predictive insights:', e);
        }

        // --- API Call 2: Get News Summary from a separate Google Search API ---
        // This call gets news from a dedicated search service.
        const searchApiUrl = `https://www.googleapis.com/customsearch/v1?key=${searchApiKey}&cx=02aa349e960e0481a&q=${encodeURIComponent(company + " news")}`;

        let newsText = 'No recent news found, please try again later.';
        let newsUrl = null;
        try {
            const searchResponse = await fetchWithRetry(searchApiUrl);
            const searchJson = await searchResponse.json();
            if (searchJson.items && searchJson.items.length > 0) {
                const firstResult = searchJson.items[0];
                newsText = `${firstResult.title}: ${firstResult.snippet}`;
                newsUrl = firstResult.link;
            }
        } catch (e) {
            console.error('Error fetching search results:', e);
            newsText = 'Failed to search for recent news. Please check your API key and search engine ID.';
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                ...insightsResponse,
                newsText,
                newsUrl,
            }),
        };

    } catch (e) {
        console.error("Error processing request:", e);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: `Server error: ${e.message}` }),
        };
    }
};
