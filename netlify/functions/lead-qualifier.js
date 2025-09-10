exports.handler = async (event, context) => {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    // Get the API key from the environment variable
    const apiKey = process.env.FIRST_API_KEY;

    if (!apiKey) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'API key not found in environment variables.' }),
        };
    }

    try {
        const body = JSON.parse(event.body);
        const { company, budget, timeline, specificNeeds } = body;

        if (!company) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Company name is required.' }),
            };
        }

        // --- API Call 1: Get Predictive Insights ---
        const insightsPayload = {
            model: "gemini-1.5-flash-latest",
            contents: [{
                parts: [{ text: `Act as a professional sales analyst. Based on the following lead information, provide a qualification score (1-100), a concise summary of key findings, and a brief outreach message draft.\n\nCompany: ${company}\nBudget: ${budget}\nTimeline: ${timeline}\nSpecific Needs: ${specificNeeds}` }]
            }],
        };

        const insightsApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;
        
        let insightsText = 'Failed to generate predictive insights.';
        try {
            const insightsResponse = await fetch(insightsApiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(insightsPayload)
            });

            const insightsJson = await insightsResponse.json();
            insightsText = insightsJson?.candidates?.[0]?.content?.parts?.[0]?.text || insightsText;
        } catch (e) {
            console.error('Error fetching predictive insights:', e);
        }

        // --- API Call 2: Get News Summary ---
        const newsPayload = {
            model: "gemini-1.5-flash-latest",
            contents: [{
                parts: [{ text: `Find public information about the company named '${company}' and provide a summary.` }]
            }],
        };

        const newsApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;

        let newsText = 'Failed to generate news summary.';
        try {
            const newsResponse = await fetch(newsApiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newsPayload)
            });

            const newsJson = await newsResponse.json();
            newsText = newsJson?.candidates?.[0]?.content?.parts?.[0]?.text || newsText;
        } catch (e) {
            console.error('Error fetching news summary:', e);
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                insightsText,
                newsText,
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
