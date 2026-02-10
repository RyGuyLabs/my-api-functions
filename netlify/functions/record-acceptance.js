// netlify/functions/record-acceptance.js

const fs = require('fs');
const path = require('path');

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const data = JSON.parse(event.body);

    // Path to store log
    const logPath = path.join(__dirname, '../../acceptance-log.json');

    // Read existing log or start new
    let log = [];
    if (fs.existsSync(logPath)) {
      log = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    }

    // Add new record
    log.push({
      timestamp: data.timestamp,
      userAgent: data.userAgent,
      page: data.page
    });

    // Save back
    fs.writeFileSync(logPath, JSON.stringify(log, null, 2));

    return { statusCode: 200, body: 'Recorded' };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: 'Error recording acceptance' };
  }
};
