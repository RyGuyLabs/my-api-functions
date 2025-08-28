exports.handler = async function(event, context) {
  const apiKey = process.env.YOUR_API_KEY;
  const apiURL = 'https://api.example.com/endpoint'; // Replace with your API's URL

  try {
    const response = await fetch(apiURL, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`API response was not ok: ${response.statusText}`);
    }

    const data = await response.json();

    return {
      statusCode: 200,
      body: JSON.stringify(data),
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to fetch data' }),
    };
  }
};
