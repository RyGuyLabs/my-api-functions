exports.handler = async function(event, context) {
  const headers = {
    "Access-Control-Allow-Origin": "*", // replace '*' with Squarespace domain in production
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  let requestData;
  try { requestData = JSON.parse(event.body); }
  catch (err) { return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const { feature, data } = requestData;

  function randomChoice(arr) { return arr[Math.floor(Math.random()*arr.length)]; }

  try {
    let responseText = "";

    switch(feature) {

      case "lead_idea":
        const status = data.status || 'Prospect';
        const intros = {
          Prospect: [
            `Hi ${data.name}, quick thought on ${data.purpose} at ${data.company}…`,
            `Hello ${data.name}, here's an idea for tackling ${data.purpose} efficiently…`,
            `Hey ${data.name}, considering ${data.purpose}? I have a suggestion…`
          ],
          Cold: [
            `Hi ${data.name}, following up on ${data.purpose} — thought this might help…`,
            `Hello ${data.name}, circling back on ${data.purpose} at ${data.company}…`,
            `Hey ${data.name}, re-engaging on ${data.purpose} — here’s a way forward…`
          ],
          Warm: [
            `Hi ${data.name}, excited to move ${data.purpose} along — consider this approach…`,
            `Hello ${data.name}, to make progress on ${data.purpose}, try this…`,
            `Hey ${data.name}, building momentum on ${data.purpose}? Here's a tip…`
          ],
          Hot: [
            `Hi ${data.name}, ready to finalize ${data.purpose}? This can help…`,
            `Hello ${data.name}, let's accelerate ${data.purpose} with this step…`,
            `Hey ${data.name}, to close ${data.purpose} smoothly, consider…`
          ],
          Converted: [
            `Hi ${data.name}, since you completed ${data.purpose}, here's an idea to maximize value…`,
            `Hello ${data.name}, thank you for choosing ${data.company}. Next steps you might love…`,
            `Hey ${data.name}, following up post-${data.purpose} to unlock more opportunities…`
          ]
        };
        const closings = [
          "Would love your thoughts — quick chat?",
          "Looking forward to your insights!",
          "Let’s make this happen — what do you think?",
          "Excited to hear your perspective!",
          "Your feedback will be invaluable!"
        ];
        responseText = `${randomChoice(intros[status])} ${randomChoice(closings)}`;
        break;

      case "nurturing_note":
        const greetings = [`Hi ${data.name},`, `Hello ${data.name},`, `Hey ${data.name},`];
        const bodies = [
          `I wanted to share some thoughts regarding ${data.purpose} at ${data.company}. This could accelerate results and make a real impact.`,
          `Just checking in on ${data.purpose}. With this approach, you'll see progress quickly and professionally.`,
          `Following up on ${data.purpose} — this strategy is designed to resonate and deliver results.`,
          `Touching base regarding ${data.purpose}. Consider this insight to elevate your next step.`
        ];
        const signOffs = ["Best regards,", "Cheers,", "Looking forward to your reply,", "To your success,"];
        responseText = `${randomChoice(greetings)} ${randomChoice(bodies)}\n\n${randomChoice(signOffs)}\nRyGuyLabs`;
        break;

      case "daily_inspiration":
        const inspirations = [
          "Take bold action today — each call moves you closer to your goals.",
          "Your next conversation could change everything — stay sharp!",
          "Consistency beats intensity. Make every interaction count.",
          "Small wins compound — focus on one lead at a time.",
          "Every challenge is an opportunity. Make today legendary."
        ];
        responseText = randomChoice(inspirations);
        break;

      case "goals_summary":
        responseText = `Your goals today:\n\n🌅 Morning: ${data.morning || "Not set"}\n☀️ Afternoon: ${data.afternoon || "Not set"}\n🌙 Evening: ${data.evening || "Not set"}\n\nStay focused and achieve each milestone!`;
        break;

      case "morning_briefing":
        const leadCount = data.leads.length || 0;
        const morningGoal = data.goals.morning.text || "Not set";
        const afternoonGoal = data.goals.afternoon.text || "Not set";
        const eveningGoal = data.goals.evening.text || "Not set";
        responseText = `🌄 Morning Briefing:\nYou have ${leadCount} active leads today.\n\nMorning Goal: ${morningGoal}\nAfternoon Goal: ${afternoonGoal}\nEvening Goal: ${eveningGoal}\n\nFocus on high-value leads first and make today productive!`;
        break;

      case "goal_decomposition":
        const goal = data.goal;
        responseText = `🔹 Breakdown of "${goal}":\n1️⃣ Clarify the outcome.\n2️⃣ Divide into weekly/daily milestones.\n3️⃣ Identify 3 immediate actions.\n4️⃣ Predict obstacles and counteract.\n5️⃣ Review progress daily.\n\nConsistency + focus = success!`;
        break;

      default:
        responseText = "Feature not recognized. Check your request.";
    }

    return { statusCode: 200, headers, body: JSON.stringify({ text: responseText }) };

  } catch(err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
