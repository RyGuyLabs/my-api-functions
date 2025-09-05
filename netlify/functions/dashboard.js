// dashboard.js
exports.handler = async function(event, context) {
  const headers = {
    "Access-Control-Allow-Origin": "*", // Allow requests from any origin (or replace * with your domain)
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };

  // Handle preflight OPTIONS request
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: "OK",
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { feature, data } = body;

    if (!feature || !data) {
      return { statusCode: 400, headers, body: JSON.stringify({ text: 'Missing feature or data.' }) };
    }

    let responseText = '';

    switch(feature){
      case 'lead_idea':
        responseText = `Idea generated for ${data.name} at ${data.company}: Follow up with a personalized email about ${data.purpose}.`;
        break;
      case 'nurturing_note':
        responseText = `Nurturing note for ${data.name}: Keep them engaged with relevant content.`;
        break;
      case 'daily_inspiration':
        responseText = `Daily inspiration: Remember, consistency beats intensity!`;
        break;
      case 'goals_summary':
        responseText = `Summary for ${data.name}: Keep pushing toward your goals today.`;
        break;
      case 'decompose_goal':
        const bigGoal = data.bigGoal || 'your goal';
        responseText = `Steps to achieve "${bigGoal}": 1) Break into smaller tasks. 2) Prioritize actions. 3) Track daily progress.`;
        break;
      case 'morning_briefing':
        responseText = `Morning briefing for ${data.name}: Follow up with hot leads and review today's tasks.`;
        break;
      default:
        return { statusCode: 400, headers, body: JSON.stringify({ text: `Unknown feature: ${feature}` }) };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ text: responseText }),
    };

  } catch(err) {
    console.error(err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ text: `Server error: ${err.message}` }),
    };
  }
};
