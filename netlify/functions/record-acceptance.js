// backend.js
const fs = require("fs");
const path = "/tmp/acceptLogs.json"; // temporary persistent store for serverless
const SECRET = process.env.RG_TERMS_SECRET; // never exposed to frontend

exports.handler = async (event) => {
  // Verify secret header for POST requests
  if (event.httpMethod === "POST") {
    if (event.headers["x-rg-secret"] !== SECRET) {
      return { statusCode: 403, body: "Forbidden" };
    }
  }

  let logs = [];
  try {
    logs = JSON.parse(fs.readFileSync(path, "utf8") || "[]");
  } catch {}

  // CHECK MODE
  if (event.queryStringParameters?.check) {
    const accepted = logs.length > 0;
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

    fs.writeFileSync(path, JSON.stringify(logs));

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true }),
    };
  }

  return { statusCode: 405 };
};
