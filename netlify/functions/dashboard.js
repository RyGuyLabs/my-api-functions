exports.handler = async function(event, context) {
  const headers = {
    "Access-Control-Allow-Origin": "*", // replace '*' with your Squarespace domain in production
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS"
  };

  // Preflight request
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  let requestData;
  try {
    requestData = JSON.parse(event.body);
  } catch (err) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { feature, data } = requestData;

  try {
    let responseText = "";

    switch (feature) {
      case "lead_idea":
        responseText = `💡 Idea for ${data.name} at ${data.company}: Start your message with a personalized reference to ${data.purpose}, highlight one benefit, and end with a question that encourages engagement.`;
        break;

      case "daily_inspiration":
        const inspirations = [
          "Focus on what you can control and take one bold action today!",
          "Every small connection is a step toward your big goal — keep moving!",
          "Your next call could be the one that changes everything. Stay sharp!",
          "Consistency beats intensity — do something productive every hour."
        ];
        responseText = inspirations[Math.floor(Math.random() * inspirations.length)];
        break;

      case "goals_summary":
        responseText = `Here's your goals overview:\n\n🌅 Morning: ${data.morning || "No goal set"}\n☀️ Afternoon: ${data.afternoon || "No goal set"}\n🌙 Evening: ${data.evening || "No goal set"}\n\nKeep pushing and make every segment count!`;
        break;

      case "nurturing_note":
        responseText = `Hey ${data.name},\n\nI hope things are going well at ${data.company}! I wanted to touch base regarding ${data.purpose}. Let me know if there’s anything I can do to support or provide more info. Looking forward to your thoughts!`;
        break;

      case "morning_briefing":
        const leadCount = data.leads.length || 0;
        const morningGoal = data.goals.morning.text || "Not set";
        const afternoonGoal = data.goals.afternoon.text || "Not set";
        const eveningGoal = data.goals.evening.text || "Not set";
        responseText = `🌄 Morning Briefing:\n\nYou have ${leadCount} active leads today.\n\nMorning Goal: ${morningGoal}\nAfternoon Goal: ${afternoonGoal}\nEvening Goal: ${eveningGoal}\n\nStay focused, prioritize top leads, and crush your targets!`;
        break;

      case "goal_decomposition":
        const goal = data.goal;
        responseText = `🔹 Decomposition of "${goal}":\n1️⃣ Define the desired outcome clearly.\n2️⃣ Break it into weekly or daily milestones.\n3️⃣ Identify the top 3 actions you can take immediately.\n4️⃣ Anticipate obstacles and plan counteractions.\n5️⃣ Review progress at the end of each day.\n\nConsistency + tracking = success!`;
        break;

      default:
        responseText = "Feature not recognized. Please check your request.";
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ text: responseText })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
