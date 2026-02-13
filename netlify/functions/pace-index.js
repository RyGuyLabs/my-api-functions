exports.handler = async function(event, context) {
// 1. SECURITY: DEFINING ALLWOED ORIGINS
// Replace with your actual production domain for maxiumum security
const allowedOrigins = ["https://your-production-domain.com", "https://localhost:8888"  Keep for local development
];
const origin = event.headers.origin
const corsOrigin = allowedOrgins.includes(origin) ? 
Origin : allowedOrigins[0];
// 2. PRODUCTION-GRADE HEADERS
    const headers = {
        "Access-Control-Allow-Origin": corsOrigin,
        "Access-Control-Allow-Headers": "Content-Type, X-Requested-With, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "X-XSS-Protection": "1; mode=block",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains"
    };
    // 3. HANDLING PREFLIGHT (OPTIONS)
    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 204, headers };
    }

    // 4. METHOD RESTRICTION
    if (event.httpMethod !== "POST") {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: "Method Not Allowed", status: "rejected" })
        };
    }

    try {
        // 5. INPUT VALIDATION & SANITIZATION
        const body = JSON.parse(event.body);
        const v1 = Math.min(Math.max(parseInt(body.v1) || 50, 0), 100);
        const v2 = Math.min(Math.max(parseInt(body.v2) || 50, 0), 100);
        const v3 = Math.min(Math.max(parseInt(body.v3) || 50, 0), 100);
        const tone = ['direct', 'neutral', 'soft'].includes(body.tone) ? body.tone : 'direct';

        // 6. PROPRIETARY CALIBRATION LOGIC
        const score = Math.round((v1 * 0.4) + (v2 * 0.3) + (v3 * 0.3));
        const diff = Math.max(v1, v2, v3) - Math.min(v1, v2, v3);
        const confidence = diff < 20 ? 'HIGH' : (diff < 40 ? 'MEDIUM' : 'LOW');
       
        const zoneKey = score < 40 ? 'low' : (score < 75 ? 'mid' : 'high');

        // Behavioral classification
        let behavior = "Balanced Pressure";
        if (v1 >= v2 && v1 >= v3) behavior = "Pressure is Outcome-Driven";
        else if (v2 >= v1 && v2 >= v3) behavior = "Pressure is Time-Driven";
        else behavior = "Pressure is Control-Driven";

        // 7. SECURE SCRIPT DATABASE
        const SCRIPT_DATABASE = {
            low: {
                direct: ["“This seems to be working well. Should we look at the timeline next?”", "“Since there's no rush, let's dive deeper into the technical scope.”"],
                neutral: ["“It sounds like we're aligned. How would you like to proceed?”", "“I'm comfortable with this pace. Is there anything else to cover?”"],
                soft: ["“I'm really enjoying this exploration. Does it feel useful to you?”", "“I'd love to hear more about your vision when you're ready.”"]
            },
            mid: {
                direct: ["“Before we go any further — just to be clear — we don’t need to decide anything today.”", "“Let me slow this down for a second — what part of this feels most relevant?”"],
                neutral: ["“I want to make sure you have the space you need to evaluate this.”", "“If we took the pressure off the outcome, what would your gut say?”"],
                soft: ["“I sense we might be moving a bit fast. Should we pause for questions?”", "“My goal is your comfort with this process. How are you feeling?”"]
            },
            high: {
                direct: ["“I'm going to stop here. I think I'm pushing too hard for an answer.”", "“Let's scrap the agenda. What's the one thing actually bothering you?”"],
                neutral: ["“It feels like there's a lot of pressure on this moment. Let's reset.”", "“I'd like to apologize if I've come across as overly attached to the result.”"],
                soft: ["“You know your business best. I'm here to support, not to convince.”", "“What if we just closed the book on this for a week and checked back in?”"]
            }
        };

        // 8. RESPONSE PACKAGING
        const result = {
            score,
            behavior,
            confidence,
            zoneKey,
            scripts: SCRIPT_DATABASE[zoneKey][tone],
            insights: {
                meaning: zoneKey === 'low' ? "Trust is accelerating. Your pace allows the other party to lean in without fear of being 'sold'." :
                         zoneKey === 'mid' ? "Frictional load detected. You are likely providing answers before they've asked the questions." :
                         "Reactance triggered. The other party likely feels cornered; any logic you provide will be viewed as a threat.",
                risk: zoneKey === 'low' ? "Minimal. Maintain current cadence and focus on deepening discovery." :
                      zoneKey === 'mid' ? "High Risk of 'Think it Over'. You must reground the conversation in their autonomy." :
                      "Total Trust Decay. The conversation will likely end with a false 'Yes' or ghosting."
            },
            timestamp: new Date().toISOString()
        };

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(result)
        };

    } catch (error) {
        console.error("[CRITICAL] Calibration Failure:", error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "Institutional Logic Engine Error", status: "failure" })
        };
    }
}; 
