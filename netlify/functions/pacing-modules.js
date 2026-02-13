exports.handler = async (event, context) => {
  // Security: Only allow POST requests
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const data = JSON.parse(event.body);
    const { time, outcome, questions, exit, phase, medium } = data;

    // THE SECRET SAUCE (Hidden Logic)
    // We maintain your proprietary weighting here, invisible to the client.
    const weights = {
      time: 0.3,
      outcome: 0.3,
      questions: 0.2,
      exit: 0.2
    };

    // Calculate Raw Base
    const pressureComponent = (time * weights.time) + 
                              (outcome * weights.outcome) + 
                              (questions * weights.questions);
    
    const safetyComponent = (100 - exit) * weights.exit;

    // Apply Contextual Multipliers
    let rawScore = (pressureComponent + safetyComponent) * parseFloat(phase) * parseFloat(medium);
    
    // Final Calibration
    const paceIndex = Math.min(100, Math.round(rawScore));

    // Determine Protocol Recommendations
    let status, recommendation, color;
    if (paceIndex > 75) {
      status = "OVERHEATED";
      color = "#ff3300";
      recommendation = "CRITICAL: Reactance triggered. The counter-party likely feels cornered. Halt all closing attempts. Pivot to high-autonomy scripts immediately: 'It's completely fine if this isn't a fit right now.'";
    } else if (paceIndex > 45) {
      status = "COMPRESSED";
      color = "#ffcc00";
      recommendation = "CAUTION: Psychological friction rising. Slow the verbal cadence. Use labeling and silence to lower the perceived cost of the interaction.";
    } else {
      status = "CALIBRATED";
      color = "#00ff88";
      recommendation = "OPTIMAL: Behavioral alignment is high. The counter-party feels in control and safe. Proceed at current pace.";
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*" // Adjust for Squarespace domain security
      },
      body: JSON.stringify({
        paceIndex,
        status,
        recommendation,
        color,
        timestamp: new Date().toISOString()
      })
    };
  } catch (error) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid Payload" }) };
  }
};
