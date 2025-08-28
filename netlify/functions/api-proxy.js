exports.handler = async function(event, context) {
  const feature = event.queryStringParameters.feature;

  let apiKey;
  let apiURL;

  switch(feature) {
    // This is the case for your first feature
    case 'RyGuy- Dreamer': // <-- Your chosen feature name
      apiKey = process.env.FIRST_API_KEY; // <-- Your API key name from Netlify
      apiURL = 'Https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent'; // <-- You MUST replace this with your real API's URL
      break;
    default:
      return {
        statusCode: 400,
        body: 'Invalid feature requested.'
      };
  }
 
  try {
    const response = await fetch(apiURL, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
   
    // ... rest of the code is the same
   
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: `Failed to fetch data for ${feature}` }),
    };
  }
};
