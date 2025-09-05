export async function handler(event, context) {
  try {
    const { feature, data } = JSON.parse(event.body || '{}');

    let responseText = '';

    switch(feature) {
      case 'lead_idea':
        responseText = `💡 Lead Idea for ${data.name} at ${data.company}: "Focus on personalized outreach highlighting ${data.purpose}"`;
        break;

      case 'nurturing_note':
        responseText = `✉️ Nurturing Note for ${data.name}: "Follow up on ${data.purpose}, showing continued value and interest."`;
        break;

      case 'daily_inspiration':
        responseText = '🌞 Daily Inspiration: Every call you make is a step closer to your goal!';
        break;

      case 'summarize_goals':
        if (!data.goals) {
          responseText = 'No goals provided.';
        } else {
          const lines = data.goals.split('\n').filter(Boolean);
          responseText = lines.map((g,i)=>`Goal ${i+1}: ${g}`).join('\n');
        }
        break;

      case 'decompose_goal':
        if (!data.goal) {
          responseText = 'No goal provided.';
        } else {
          responseText = [
            `Define the key outcome for: "${data.goal}"`,
            'Break it into 3 actionable steps',
            'Assign deadlines to each step',
            'Review and adjust weekly'
          ].join('\n');
        }
        break;

      case 'morning_briefing':
        responseText = '📝 Morning Briefing: Review your hot leads, follow up with warm leads, and plan your key actions for the day!';
        break;

      default:
        responseText = 'Feature not recognized.';
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ text: responseText })
    };

  } catch(err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ text: `Error: ${err.message}` })
    };
  }
}
