// dashboard.js
exports.handler = async function(event, context) {
  try {
    const body = JSON.parse(event.body || '{}');
    const { feature, data } = body;

    if (!feature || !data) {
      return { statusCode: 400, body: JSON.stringify({ text: 'Missing feature or data.' }) };
    }

    // Dummy responses for each feature
    switch(feature){
      case 'lead_idea':
        return { statusCode: 200, body: JSON.stringify({ text: `Idea generated for ${data.name} at ${data.company}: Follow up with a personalized email about ${data.purpose}.` }) };
      case 'nurturing_note':
        return { statusCode: 200, body: JSON.stringify({ text: `Nurturing note for ${data.name}: Keep them engaged with relevant content.` }) };
      case 'daily_inspiration':
        return { statusCode: 200, body: JSON.stringify({ text: `Daily inspiration: Remember, consistency beats intensity!` }) };
      case 'goals_summary':
        return { statusCode: 200, body: JSON.stringify({ text: `Summary for ${data.name}: Keep pushing toward your goals today.` }) };
      case 'decompose_goal':
        const bigGoal = data.bigGoal || 'your goal';
        return { statusCode: 200, body: JSON.stringify({ text: `Steps to achieve "${bigGoal}": 1) Break into smaller tasks. 2) Prioritize actions. 3) Track daily progress.` }) };
      case 'morning_briefing':
        return { statusCode: 200, body: JSON.stringify({ text: `Morning briefing for ${data.name}: Follow up with hot leads and review today's tasks.` }) };
      default:
        return { statusCode: 400, body: JSON.stringify({ text: `Unknown feature: ${feature}` }) };
    }

  } catch(err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ text: `Server error: ${err.message}` }) };
  }
};
