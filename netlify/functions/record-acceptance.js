// backend.js
const fs = require("fs");
const path = "./acceptLogs.json"; // persistent file for demonstration
const SECRET = process.env.RG_TERMS_SECRET; // secure server-side only

exports.handler = async (event) => {
  // Only allow POST with correct secret
  if (event.httpMethod === "POST") {
    if (event.headers["x-rg-secret"] !== SECRET) {
      return { statusCode: 403, body: "Forbidden" };
    }
  }

  // Load logs
  let logs = [];
  try {
    logs = JSON.parse(fs.readFileSync(path, "utf8") || "[]");
  } catch {}

  // CHECK MODE
  if (event.queryStringParameters?.check) {
    // Track acceptance per IP
    const ip = event.headers["client-ip"] || event.headers["x-forwarded-for"] || "unknown";
    const accepted = logs.some(log => log.ip === ip);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accepted }),
    };
  }

  // RECORD MODE
  if (event.httpMethod === "POST") {
    const data = JSON.parse(event.body || "{}");
    const ip = event.headers["client-ip"] || event.headers["x-forwarded-for"] || "unknown";

    logs.push({
      ip,
      ...data
    });

    fs.writeFileSync(path, JSON.stringify(logs));

    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  }

  return { statusCode: 405 };
};
