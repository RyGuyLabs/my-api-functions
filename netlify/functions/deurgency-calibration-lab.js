const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  try {
    const { profile, pressure } = JSON.parse(event.body);

    const profiles = {
      Anxious: { 
        base: 30, 
        high: "I feel pushed. I'm leaving.", 
        mid: "I'm listening, but still a bit cautious.", 
        low: "I appreciate the space you're giving me." 
      },
      Guarded: { 
        base: 45, 
        high: "What's the catch? This is too much.", 
        mid: "Okay, I'm following your train of thought.", 
        low: "This feels transparent and honest." 
      },
      Analytical: { 
        base: 60, 
        high: "Your logic is forced and aggressive.", 
        mid: "The data points align so far.", 
        low: "This is a sound, objective proposal." 
      },
      Skeptical: { 
        base: 20, 
        high: "Standard sales trap. I'm out.", 
        mid: "You're making sense, surprisingly.", 
        low: "You're actually listening to my concerns." 
      }
    };

    const selectedProfile = profiles[profile] || profiles.Anxious;
    const trust = Math.max(0, Math.min(100, selectedProfile.base + (100 - pressure) / 2 - (pressure / 4)));
    const heat = Math.round(pressure * 1.2);

    let statusText = `"${selectedProfile.mid}"`;
    let statusColor = "#ffffff";
    let coachInsight = null;

    // Logic for the Spectrum Zones
    if (pressure > 70) {
      statusText = `"${selectedProfile.high}"`;
      statusColor = "#ff3300"; // Danger Red
      coachInsight = "RyGuyLabs Insight: High urgency creates 'Choice Paralysis'. Ease pressure to re-engage.";
    } else if (pressure < 30) {
      statusText = `"${selectedProfile.low}"`;
      statusColor = "#00ff88"; // Safe Green
      coachInsight = "RyGuyLabs Insight: High autonomy builds 'Relational Equity'. This is where the long-term win happens.";
    } else {
      statusText = `"${selectedProfile.mid}"`;
      statusColor = "#ffaa00"; // Neutral/Momentum Orange
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        trust: Math.round(trust),
        heat: heat,
        statusText: statusText,
        statusColor: statusColor,
        coachInsight: coachInsight
      })
    };
  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Calibration Error" }) };
  }
};
