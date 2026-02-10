exports.handler = async (event) => {

  // SIMPLE IN-MEMORY STORE (Replace with DB later if you want)
  global.acceptLogs = global.acceptLogs || [];

  // CHECK MODE
  if (event.queryStringParameters?.check) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accepted: false }) 
    };
  }

  // RECORD MODE
  if (event.httpMethod === "POST") {

    const data = JSON.parse(event.body || "{}");

    global.acceptLogs.push({
      ip: event.headers["client-ip"] || event.headers["x-forwarded-for"],
      ...data
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };
  }

  return { statusCode: 405 };
};
