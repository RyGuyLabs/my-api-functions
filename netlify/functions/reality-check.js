exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': 'https://ryguylabs.com', 
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  try {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }), headers };
    if (!event.body || event.body.length > 1000) return { statusCode: 413, body: JSON.stringify({ error: 'Payload too large' }), headers };

    const body = JSON.parse(event.body);
    if (!Array.isArray(body.selections) || body.selections.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid input data' }), headers };
    }

    const targetName = String(body.targetName || 'that person');
    const targetWin = String(body.targetWin || 'the win');
    const selections = body.selections.map(val => parseInt(val, 10));

    if (!selections.every(val => Number.isInteger(val) && val >= 0 && val <= 30)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid selection values' }), headers };
    }

    const totalScore = selections.reduce((sum, val) => sum + val, 0);

    let title = '', color = '', desc = '', quote = '';
    if (totalScore >= 60) {
      title = 'The Golden Cage'; color = '#00f2ff';
      desc = `You're looking at ${targetName}'s ${targetWin}, but you aren't seeing the bars. The "True Cost" here is freedom. They have the trophy, but they've signed over their time and soul to keep it. This isn't a win; it's an obligation.`;
      quote = 'Prestige is the trophy you get for winning a race you didn\'t even want to run. Build your own track instead.';
    } else if (totalScore >= 30) {
      title = 'The Paper Tiger'; color = '#ffae00';
      desc = `${targetName} has high visibility, but low internal stability. The ${targetWin} is a mask for a deep lack of peace. Their engine is loud, but the tank is almost empty. Stop comparing your foundation to their paint job.`;
      quote = 'Most people don\'t want to be rich; they just want to be richer than the person they hate.';
    } else {
      title = 'The Real Deal'; color = '#00ff88';
      desc = `It looks like ${targetName} might have actually earned this ${targetWin} with genuine balance. Don't waste energy hating—use it as data. They've proven it's possible. Now, get back to building your own ecosystem.`;
      quote = 'The only debt that truly bankrupts a person is the one they owe to someone who doesn\'t even like them.';
    }

    return { statusCode: 200, headers, body: JSON.stringify({ totalScore, title, color, desc, quote }) };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server error' })
    };
  }
};
