const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { profile, pressure } = JSON.parse(event.body);

    // PROPRIETARY ALGORITHM EXTRACTION
    const profiles = {
      Anxious: { base: 30, high: "I feel pushed. I'm leaving.", low: "I appreciate the space." },
      Guarded: { base: 45, high: "What's the catch?", low: "This feels transparent." },
      Analytical: { base: 60, high: "Your logic is forced.", low: "This is a sound proposal." },
      Skeptical: { base: 20, high: "Standard sales trap.", low: "You're actually listening." }
    };

    const selectedProfile = profiles[profile] || profiles.Anxious;
    
    // Core Scoring Logic: Trust is negatively impacted by pressure beyond a specific base threshold
    const trust = Math.max(0, Math.min(100, selectedProfile.base + (100 - pressure) / 2 - (pressure / 4)));
    const heat = Math.round(pressure * 1.2);

    let statusText = "Processing conversational input...";
    let statusColor = "#ffffff";

    if (pressure > 70) {
      statusText = `"${selectedProfile.high}"`;
      statusColor = "#ff3300"; // Danger
    } else if (pressure < 30) {
      statusText = `"${selectedProfile.low}"`;
      statusColor = "#00ff88"; // Safe
    }

    // Return the calculated state to the thin client
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        trust: Math.round(trust),
        heat: heat,
        statusText: statusText,
        statusColor: statusColor,
        coachInsight: pressure > 80 ? "RyGuyLabs Insight: High urgency creates 'Choice Paralysis'. Ease pressure to re-engage." : null
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Internal Calibration Error" })
    };
  }
};
