// netlify/functions/addLead.js

let leads = []; // Temporary storage

exports.handler = async function(event, context) {
  try {
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: "Method not allowed" })
      };
    }

    const data = JSON.parse(event.body);

    // Create a new lead object
    const newLead = {
      id: Date.now(),
      date: new Date().toLocaleDateString(),
      name: data.name,
      company: data.company,
      purpose: data.purpose,
      contactType: data.contactType || "",
      timeOfDay: data.timeOfDay || "",
      status: "Prospect"
    };

    // Add the lead to the array
    leads.push(newLead);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true, lead: newLead })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server error: " + err.message })
    };
  }
};
