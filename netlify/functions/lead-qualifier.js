// function.js
exports.handler = async (event, context) => {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    // Get the API key from environment variables
    const apiKey = process.env.FIRST_API_KEY;
    if (!apiKey) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'API key not found in environment variables.' }),
        };
    }

    try {
        const body = JSON.parse(event.body);
        const company = body.company;

        if (!company) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Company name is required.' }),
            };
        }

        // Construct Gemini API request payload
        const requestPayload = {
            model: "gemini-1.5-flash-latest",
            temperature: 0, // reduce hallucinations
            contents: [
                {
                    parts: [
                        {
                            text: `Using the Google Search tool, retrieve the latest verified news (with source links) about the company '${company}'. Summarize in 3-5 sentences.`
                        }
                    ]
                }
            ],
            tools: [
                {
                    "google_search": { "max_results": 3 } // get top 3 news results
                }
            ],
        };

        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;

        // Exponential backoff for retries
        let responseJson;
        let retries = 0;
        const maxRetries = 5;
        let success = false;

        while (retries < maxRetries) {
            try {
                const apiResponse = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestPayload)
                });

                if (apiResponse.ok) {
                    responseJson = await apiResponse.json();
                    success = true;
                    break;
                } else {
                    const errorText = await apiResponse.text();
                    console.error(`API call attempt ${retries + 1} failed with status ${apiResponse.status}: ${errorText}`);
                }
            } catch (e) {
                console.error(`API call attempt ${retries + 1} failed:`, e);
            }
            retries++;
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retries)));
        }

        if (!success || !responseJson) {
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'Failed to get a successful response from the Gemini API after multiple retries.' }),
            };
        }

        // Extract news content
        const candidate = responseJson?.candidates?.[0];
        let newsText = 'The Gemini API could not find or generate news for this company. Please try again later.';
        if (candidate?.content?.parts?.length) {
            newsText = candidate.content.parts.map(p => p.text).join('\n\n');
        }

        // Extract first grounding/source link if available
        let newsSource = 'N/A';
        const groundingMetadata = candidate?.groundingMetadata;
        if (groundingMetadata?.groundingAttributions?.length) {
            const webAttr = groundingMetadata.groundingAttributions.find(a => a.web?.uri);
            if (webAttr) {
                const uri = webAttr.web.uri;
                const title = webAttr.web.title || uri;
                newsSource = `<a href="${uri}" target="_blank" class="text-blue-400 hover:underline">[Source: ${title}]</a>`;
            }
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ newsText, newsSource }),
        };

    } catch (e) {
        console.error("Error processing request:", e);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: `Server error: ${e.message}` }),
        };
    }
};
