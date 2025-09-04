const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  // --- Handle CORS preflight (OPTIONS requests) ---
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
      },
      body: "OK"
    };
  }

  try {
    const { feature, data } = JSON.parse(event.body || '{}');

    if (!feature) {
      return {
        statusCode: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: 'No feature specified.' })
      };
    }

    let result = '';

    switch (feature) {
      case 'lead_idea':
        result = `💡 Powerful Lead Idea:\n\nHi ${data.name}, imagine unlocking real growth at ${data.company}. I’d love to connect about ${data.purpose}—let’s make this a success story worth remembering.`;
        break;

      case 'daily_inspiration':
        result = "🔥 Daily Inspiration:\n\nSmall wins stack into big victories. Stay consistent, keep moving forward, and today will be a breakthrough moment.";
        break;

      case 'goals_summary':
        const morning = data.morning || '';
        const afternoon = data.afternoon || '';
        const evening = data.evening || '';
        result = `📊 Today's Goals Summary:\n\n🌅 Morning: ${morning}\n🌞 Afternoon: ${afternoon}\n🌙 Evening: ${evening}`;
        break;

      case 'nurturing_note':
        result = `🤝 Nurturing Note:\n\nHi ${data.name}, I appreciate the energy at ${data.company}. Let’s continue exploring ${data.purpose}—this could become something remarkable together.`;
        break;

      case 'morning_briefing':
        const leads = data.leads || [];
        const goals = data.goals || {};
        result = `📋 Morning Briefing:\n\nYou have ${leads.length} active leads today.\n\nGoals:\n- Morning: ${goals.morning?.text || ''}\n- Afternoon: ${goals.afternoon?.text || ''}\n- Evening: ${goals.evening?.text || ''}`;
        break;

      case 'goal_decomposition':
        const bigGoal = data.goal || 'Unnamed Goal';
        result = `🛠 Step-by-step plan to achieve "${bigGoal}":\n\n1️⃣ Break into smaller, focused tasks\n2️⃣ Assign deadlines with accountability\n3️⃣ Track progress daily\n4️⃣ Celebrate milestones to build momentum`;
        break;

      default:
        return {
          statusCode: 400,
          headers: { "Access-Control-Allow-Origin": "*" },
          body: JSON.stringify({ error: 'Unknown feature.' })
        };
    }

    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ text: result }),
    };
  } catch (err) {
    console.error('Function error:', err);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: 'Server error.', message: err.message }),
    };
  }
};
