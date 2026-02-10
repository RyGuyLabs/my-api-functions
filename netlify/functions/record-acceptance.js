const fs = require("fs");
const path = "/tmp/acceptLogs.json"; // Netlify allows writing to /tmp

exports.handler = async (event) => {
  let logs = [];

  // Load existing logs
  try {
    logs = JSON.parse(fs.readFileSync(path, "utf8") || "[]");
  } catch {}

  // CHECK MODE
  if (event.queryStringParameters?.check) {
    const accepted = logs.length > 0; // at least one acceptance recorded
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accepted }),
    };
  }

  // RECORD MODE
  if (event.httpMethod === "POST") {
    const data = JSON.parse(event.body || "{}");

    logs.push({
      ip: event.headers["client-ip"] || event.headers["x-forwarded-for"] || "unknown",
      ...data,
    });

    // Save logs
    try {
      fs.writeFileSync(path, JSON.stringify(logs));
    } catch {}

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true }),
    };
  }

  return { statusCode: 405 };
};
