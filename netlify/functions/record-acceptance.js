exports.handler = async (event) => {

  const SECRET = process.env.RG_TERMS_SECRET;

  if (event.headers["x-rg-secret"] !== SECRET) {
    return { statusCode: 403, body: "Forbidden" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405 };
  }

  try {

    const data = JSON.parse(event.body);

    console.log("TERMS ACCEPTED:", {
      timestamp: data.acceptedAt,
      userAgent: data.userAgent,
      page: data.page,
      ip: event.headers["client-ip"] || "unknown"
    });

    return {
      statusCode: 200,
      body: "Logged"
    };

  } catch(err) {

    return {
      statusCode: 500,
      body: "Server Error"
    };

  }

};
