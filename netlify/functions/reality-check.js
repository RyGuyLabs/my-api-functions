exports.handler = async function(event, context) {
  // Set standard headers for CORS
  const headers = {
    'Access-Control-Allow-Origin': 'https://www.ryguylabs.com', // Only allow your domain
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  try {
    // Handle preflight request
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 204, headers };
    }

    // Only POST requests allowed
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }), headers };
    }

    // Parse and validate JSON
    let body;
    try {
      body = JSON.parse(event.body);
    } catch {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }), headers };
    }

    const { targetName = 'that person', targetWin = 'the win', selections } = body;

    if (!Array.isArray(selections) || selections.length === 0 || !selections.every(n => typeof n === 'number')) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid selections array' }), headers };
    }

    // Calculate total score safely
    const totalScore = selections.reduce((sum, val) => sum + Number(val || 0), 0);

    // Determine result
    let result = { title: '', color: '', desc: '', quote: '' };

    if (totalScore >= 60) {
      result = {
        title: 'The Golden Cage',
        color: '#00f2ff',
        desc: `You're looking at ${targetName}'s ${targetWin}, but you aren't seeing the bars. The "True Cost" here is freedom. They have the trophy, but they've signed over their time and soul to keep it. This isn't a win; it's an obligation.`,
        quote: 'Prestige is the trophy you get for winning a race you didn\'t even want to run. Build your own track instead.'
      };
    } else if (totalScore >= 30) {
      result = {
        title: 'The Paper Tiger',
        color: '#ffae00',
        desc: `${targetName} has high visibility, but low internal stability. The ${targetWin} is a mask for a deep lack of peace. Their engine is loud, but the tank is almost empty. Stop comparing your foundation to their paint job.`,
        quote: 'Most people don\'t want to be rich; they just want to be richer than the person they hate.'
      };
    } else {
      result = {
        title: 'The Real Deal',
        color: '#00ff88',
        desc: `It looks like ${targetName} might have actually earned this ${targetWin} with genuine balance. Don't waste energy hating—use it as data. They've proven it's possible. Now, get back to building your own ecosystem.`,
        quote: 'The only debt that truly bankrupts a person is the one they owe to someone who doesn\'t even like them.'
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ totalScore, ...result })
    };

  } catch (err) {
    // Unexpected server errors
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Server error', details: err.message })
    };
  }
};
