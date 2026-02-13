exports.handler = async (event) => {
  // Allow POST only
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: {
        "Allow": "POST",
        "Access-Control-Allow-Origin": "*", // <-- CORS
      },
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  try {
    const data = JSON.parse(event.body);

    const time = Number(data.time);
    const outcome = Number(data.outcome);
    const questions = Number(data.questions);
    const exit = Number(data.exit);
    const phase = Number(data.phase);
    const medium = Number(data.medium);

    const rawScore =
      ((time * 0.3) +
       (outcome * 0.3) +
       (questions * 0.2) +
       ((100 - exit) * 0.2)) *
      phase * medium;

    const pace = Math.min(100, Math.round(rawScore));

    let zone;
    let recommendation;

    if (pace > 75) {
      zone = "OVERHEATED";
      recommendation = "CRITICAL: Reactance triggered. The counter-party likely feels cornered. Halt closing attempts. Pivot to autonomy scripts.";
    } else if (pace > 45) {
      zone = "COMPRESSED";
      recommendation = "CAUTION: Psychological friction rising. Slow cadence. Use labeling and silence.";
    } else {
      zone = "CALIBRATED";
      recommendation = "OPTIMAL: Behavioral alignment is high. Proceed at current pace.";
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*", // <-- CORS
      },
      body: JSON.stringify({
        pace,
        zone,
        recommendation,
      }),
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*", // <-- CORS
      },
      body: JSON.stringify({ error: "Calculation failed" }),
    };
  }
};
