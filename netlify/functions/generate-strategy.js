exports.handler = async (event) => {
  try {
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        message: "Function executed successfully",
        httpMethod: event.httpMethod,
        hasBody: !!event.body,
        parsedBody: event.body ? JSON.parse(event.body) : null,
        env: {
          FIRST_API_KEY_EXISTS: !!process.env.FIRST_API_KEY
        }
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        error: "Function threw",
        message: err.message,
        stack: err.stack
      })
    };
  }
};
