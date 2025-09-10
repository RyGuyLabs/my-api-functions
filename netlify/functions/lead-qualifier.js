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
        const company = body.company;

        if (!company) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Company name is required.' }),
            };
        }

        // Construct the payload for the Gemini API call
        const requestPayload = {
            model: "gemini-1.5-flash-latest",
            contents: [{
                parts: [{ text: `Find the latest news and a brief summary for the company named '${company}'. Provide the summary and a citation link to the source.` }]
            }],
            tools: [{ "google_search": {} }],
        };

        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;

        // Make the API call with exponential backoff using fetch
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

        const candidate = responseJson?.candidates?.[0];
        const groundingMetadata = candidate?.groundingMetadata;
        let newsText = 'Failed to retrieve real-time news.';
        let newsSource = 'N/A';

        if (candidate && candidate.content?.parts?.[0]?.text) {
            newsText = candidate.content.parts[0].text;
            if (groundingMetadata && groundingMetadata.groundingAttributions) {
                const source = groundingMetadata.groundingAttributions.find(attr => attr.web?.uri);
                if (source) {
                    const uri = source.web.uri;
                    const title = source.web.title || uri;
                    newsSource = `<a href="${uri}" target="_blank" class="text-blue-400 hover:underline">[Source: ${title}]</a>`;
                }
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
