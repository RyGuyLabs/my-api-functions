exports.handler = async (event) => {

  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };

  try {

    if (event.httpMethod === "OPTIONS") {
      return { statusCode: 204, headers };
    }

    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        headers,
        body: JSON.stringify({ error: "Method Not Allowed" })
      };
    }

    const body = JSON.parse(event.body || "{}");

    const targetName = body.targetName || "that person";
    const targetWin = body.targetWin || "the win";
    const selections = Array.isArray(body.selections) ? body.selections : [];

    if (selections.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Invalid selections array" })
      };
    }

    const totalScore = selections.reduce((sum, val) => sum + Number(val || 0), 0);

    let title, color, desc, quote;

    if (totalScore >= 60) {
      title = "The Golden Cage";
      color = "#00f2ff";
      desc = `You're looking at ${targetName}'s ${targetWin}, but you aren't seeing the bars. The true cost here is freedom. They have the trophy, but they've signed over their time and soul to keep it.`;
      quote = "Prestige is the trophy you get for winning a race you didn’t want.";
    }
    else if (totalScore >= 30) {
      title = "The Paper Tiger";
      color = "#ffae00";
      desc = `${targetName} has high visibility but low internal stability. The ${targetWin} is likely masking deeper instability.`;
      quote = "Most people don’t want success. They want comparison dominance.";
    }
    else {
      title = "The Real Deal";
      color = "#00ff88";
      desc = `${targetName} may have earned this ${targetWin} with genuine balance. Use it as data, not envy fuel.`;
      quote = "The only real debt is living someone else’s life.";
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        totalScore,
        title,
        color,
        desc,
        quote
      })
    };

  } catch (err) {

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "Server Error",
        message: err.message
      })
    };

  }
};
