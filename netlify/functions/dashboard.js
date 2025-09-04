const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  try {
    const { feature, data } = JSON.parse(event.body || '{}');

    if (!feature) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No feature specified.' }) };
    }

    // Simple mock AI responses for demo / testing
    // Replace with OpenAI or other AI calls if desired
    let result = '';

    switch (feature) {
      case 'lead_idea':
        result = `Hi ${data.name}, try reaching out to ${data.company} about ${data.purpose}. Keep it friendly and solution-focused!`;
        break;

      case 'daily_inspiration':
        result = "Your daily inspiration: Take small steps consistently and you'll crush your goals today!";
        break;

      case 'goals_summary':
        const morning = data.morning || '';
        const afternoon = data.afternoon || '';
        const evening = data.evening || '';
        result = `Today's Goals Summary:\nMorning: ${morning}\nAfternoon: ${afternoon}\nEvening: ${evening}`;
        break;

      case 'nurturing_note':
        result = `Hi ${data.name}, just checking in! Hope all is going well at ${data.company}. Let's continue the conversation about ${data.purpose}.`;
        break;

      case 'morning_briefing':
        const leads = data.leads || [];
        const goals = data.goals || {};
        result = `Morning Briefing:\nYou have ${leads.length} leads today.\nGoals:\nMorning: ${goals.morning?.text || ''}\nAfternoon: ${goals.afternoon?.text || ''}\nEvening: ${goals.evening?.text || ''}`;
        break;

      case 'goal_decomposition':
        const bigGoal = data.goal || 'Unnamed Goal';
        result = `Step-by-step plan to achieve "${bigGoal}":\n1. Break into smaller tasks\n2. Assign deadlines\n3. Track progress daily\n4. Celebrate milestones`;
        break;

      default:
        return { statusCode: 400, body: JSON.stringify({ error: 'Unknown feature.' }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ text: result }),
    };
  } catch (err) {
    console.error('Function error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server error.', message: err.message }),
    };
  }
};
