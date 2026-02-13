exports.handler = async (event) => {
  try {

    // CORS PRE-FLIGHT SUPPORT
    if (event.httpMethod === "OPTIONS") {
      return {
        statusCode: 200,
        headers: corsHeaders(),
        body: ""
      };
    }

    if (event.httpMethod !== "POST") {
      return response(405, { error: "Method Not Allowed" });
    }

    const body = JSON.parse(event.body || "{}");

    const v1 = Number(body.v1 || 0);
    const v2 = Number(body.v2 || 0);
    const v3 = Number(body.v3 || 0);
    const tone = body.tone || "direct";

    // --- CORE CALC ---
    const rawScore = Math.round(
      (v1 * 0.4) +
      (v2 * 0.35) +
      ((100 - v3) * 0.25)
    );

    const score = clamp(rawScore, 0, 100);

    let zoneKey = "low";
    if (score >= 70) zoneKey = "high";
    else if (score >= 40) zoneKey = "mid";

    const behaviorMap = {
      low: "Low Conversational Pressure",
      mid: "Controlled Pressure",
      high: "High Pressure Escalation"
    };

    const insights = generateInsights(zoneKey, tone);
    const scripts = generateScripts(zoneKey, tone);

    return response(200, {
      score,
      zoneKey,
      behavior: behaviorMap[zoneKey],
      insights,
      scripts
    });

  } catch (err) {
    console.error("PACE INDEX ERROR:", err);

    return response(500, {
      error: "Calibration Engine Failure"
    });
  }
};

// ---------------- HELPERS ----------------

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };
}

function response(code, data) {
  return {
    statusCode: code,
    headers: corsHeaders(),
    body: JSON.stringify(data)
  };
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

// ---------------- LOGIC LAYERS ----------------

function generateInsights(zone, tone) {

  const map = {
    low: {
      meaning: "Prospect perceives low urgency and high safety.",
      risk: "May delay decision or disengage."
    },
    mid: {
      meaning: "Balanced tension supporting rational decision flow.",
      risk: "Risk of slipping into over-explanation."
    },
    high: {
      meaning: "Prospect perceives strong outcome pressure.",
      risk: "High probability of defensive resistance."
    }
  };

  return map[zone];
}

function generateScripts(zone, tone) {

  const scripts = {
    low: {
      direct: [
        "Walk me through what would need to change for this to become urgent.",
        "What’s currently making this optional?"
      ],
      neutral: [
        "How are you currently prioritizing this?",
        "Where does this sit relative to other initiatives?"
      ],
      soft: [
        "Curious — how important does this feel today?",
        "Would it be okay if we explored timing together?"
      ]
    },

    mid: {
      direct: [
        "What would prevent you from moving forward today?",
        "Is there anything still unresolved on your side?"
      ],
      neutral: [
        "How are you evaluating next steps internally?",
        "What would you need to feel confident here?"
      ],
      soft: [
        "What would make this feel like the right next move?",
        "How are you feeling about this direction overall?"
      ]
    },

    high: {
      direct: [
        "Let’s slow this down — what feels most pressured right now?",
        "What concern should we address first?"
      ],
      neutral: [
        "Where does this feel rushed from your perspective?",
        "What would help create more clarity?"
      ],
      soft: [
        "Would it help to step back and reassess priorities?",
        "What part of this feels most uncertain?"
      ]
    }
  };

  return scripts[zone][tone];
}
