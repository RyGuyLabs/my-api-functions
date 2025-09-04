const fetch = require('node-fetch'); // if you call external APIs, optional

exports.handler = async function(event, context) {
  try {
    if(event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    const { feature, data } = JSON.parse(event.body);

    switch(feature){
      case 'lead_idea':
        return {
          statusCode: 200,
          body: JSON.stringify({ text: `Try reaching out to ${data.name} at ${data.company} about ${data.purpose} with a friendly, value-first approach.` })
        };
      case 'daily_inspiration':
        return { statusCode: 200, body: JSON.stringify({ text: "Start your day strong! Remember, every call brings you closer to success." }) };
      case 'goals_summary':
        const summary = `Morning: ${data.morning}\nAfternoon: ${data.afternoon}\nEvening: ${data.evening}`;
        return { statusCode: 200, body: JSON.stringify({ text: summary }) };
      case 'nurturing_note':
        return { statusCode: 200, body: JSON.stringify({ text: `Hi ${data.name}, just checking in regarding ${data.purpose}. Let's touch base soon!` }) };
      case 'morning_briefing':
        return { statusCode: 200, body: JSON.stringify({ text: `Today’s leads: ${data.leads.length}. Goals: Morning(${data.goals.morning.text}), Afternoon(${data.goals.afternoon.text}), Evening(${data.goals.evening.text})` }) };
      case 'goal_decomposition':
        return { statusCode: 200, body: JSON.stringify({ text: `Break down your big goal: "${data.goal}" into smaller, actionable steps.` }) };
      default:
        return { statusCode: 400, body: JSON.stringify({ text: "Unknown feature" }) };
    }

  } catch(e){
    return { statusCode: 500, body: JSON.stringify({ text: `Server Error: ${e.message}` }) };
  }
}
