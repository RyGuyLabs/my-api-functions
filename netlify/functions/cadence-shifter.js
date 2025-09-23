// This file is a Netlify serverless function that securely handles API calls
// to the Google Gemini API, using an environment variable for the API key.

// The handler function is the entry point for the serverless function.
exports.handler = async (event) => {
    // Check if the API key environment variable is set.
    const apiKey = process.env.FIRST_API_KEY;
    if (!apiKey) {
        console.error("FIRST_API_KEY is not set in environment variables.");
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Server configuration error: API key not found." }),
        };
    }

    // Ensure the request is a POST request and has a body.
    if (event.httpMethod !== 'POST' || !event.body) {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: "Method Not Allowed or missing body." }),
        };
    }

    try {
        // Parse the incoming JSON payload from the request body.
        const { prompt, text } = JSON.parse(event.body);

        // Define the API endpoint and the model to use.
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

        // Construct the payload for the Gemini API call.
        const payload = {
            contents: [{ parts: [{ text: `Shift the persona and tone of the following text based on this prompt: "${prompt}"\n\nText to transform: "${text}"` }] }],
        };

        // Make the API call to the Gemini API.
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        // Check if the API call was successful.
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`API call failed with status: ${response.status}. Details: ${JSON.stringify(errorData)}`);
        }

        // Get the response data and extract the transformed text.
        const result = await response.json();
        const transformedText = result?.candidates?.[0]?.content?.parts?.[0]?.text;

        // If the response is empty or malformed, throw an error.
        if (!transformedText) {
            throw new Error("API response was empty or malformed.");
        }

        // Return the transformed text back to the client.
        return {
            statusCode: 200,
            body: JSON.stringify({ transformedText }),
        };
    } catch (e) {
        // Handle any errors that occur during the process.
        console.error("Error in serverless function:", e);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Failed to process request.", details: e.message }),
        };
    }
};
