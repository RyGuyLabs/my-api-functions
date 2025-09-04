exports.handler = async function(event, context) {
  try {
    // Temporary in-memory leads for testing
    const leads = [
      { id: 1, date: "09/03/2025", name: "Ryan", company: "RyGuyLabs", purpose: "Demo", contactType: "Call", timeOfDay: "Morning", status: "Prospect" },
      { id: 2, date: "09/03/2025", name: "Alex", company: "Acme Corp", purpose: "Follow-up", contactType: "Email", timeOfDay: "Afternoon", status: "Warm" }
    ];

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(leads)
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server error: " + err.message })
    };
  }
};
