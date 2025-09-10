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

        const cacheBuster = Math.random();

        // --- API Call 1: Get Predictive Insights from Gemini ---
        const insightsPayload = {
            model: "gemini-1.5-flash-latest",
            contents: [{
                parts: [{ text: `Act as a professional sales analyst. Based on the following lead information, provide a qualification score (1-100), a concise summary of key findings, and a brief, professional, and punchy outreach message draft with a clear, motivational call to action.\n\nCompany: ${company}\nBudget: ${budget}\nTimeline: ${timeline}\nSpecific Needs: ${specificNeeds}\n\nCache Buster: ${cacheBuster}` }]
            }],
        };

        const insightsApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${geminiApiKey}`;

        let insightsText = 'Failed to generate predictive insights.';
        try {
            const insightsResponse = await fetchWithRetry(insightsApiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(insightsPayload)
            });
            const insightsJson = await insightsResponse.json();
            insightsText = insightsJson?.candidates?.[0]?.content?.parts?.[0]?.text || insightsText;
        } catch (e) {
            console.error('Error fetching predictive insights:', e);
        }

        // --- API Call 2: Get News Summary from a separate Google Search API ---
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

        // --- API Call 3: Use Gemini to summarize the search results (optional) ---
        if (newsUrl) {
            const summaryPayload = {
                model: "gemini-1.5-flash-latest",
                contents: [{
                    parts: [{ text: `Summarize the following article: ${newsUrl}` }]
                }],
            };
            const summaryApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${geminiApiKey}`;
            try {
                const summaryResponse = await fetchWithRetry(summaryApiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(summaryPayload)
                });
                const summaryJson = await summaryResponse.json();
                const summaryText = summaryJson?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (summaryText) {
                    newsText = summaryText;
                }
            } catch (e) {
                console.error('Error summarizing article:', e);
            }
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                insightsText,
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
