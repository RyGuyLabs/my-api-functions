const ALLOWED_ORIGINS = Object.freeze([
  "https://www.ryguylabs.com",
  "https://ryguylabs.com"
]);

function getAllowedOrigin(event) {
  const requestOrigin =
    event &&
    event.headers &&
    (
      event.headers.origin ||
      event.headers.Origin
    );

  if (
    requestOrigin &&
    ALLOWED_ORIGINS.includes(
      requestOrigin
    )
  ) {
    return requestOrigin;
  }

  return ALLOWED_ORIGINS[0];
}

function headers(event) {
  return {
    "Access-Control-Allow-Origin":
      getAllowedOrigin(event),

    "Access-Control-Allow-Headers":
      "Content-Type",

    "Access-Control-Allow-Methods":
      "GET, OPTIONS",

    "Content-Type":
      "application/json",

    "Cache-Control":
      "no-store",

    "X-Content-Type-Options":
      "nosniff"
  };
}

function buildFirebasePublicConfig(
  env = process.env
) {
  const apiKey =
    env.FIREBASE_API_KEY || null;

  const projectId =
    env.FIREBASE_PROJECT_ID ||
    env.FIRESTORE_PROJECT_ID ||
    env.GOOGLE_CLOUD_PROJECT ||
    env.GCLOUD_PROJECT ||
    env.GCP_PROJECT ||
    null;

  const appId =
    env.FIREBASE_APP_ID || null;

  const authDomain =
    env.FIREBASE_AUTH_DOMAIN ||
    (
      projectId
        ? `${projectId}.firebaseapp.com`
        : null
    );

  return {
    apiKey,
    authDomain,
    projectId,
    appId
  };
}

function hasCompleteConfig(config) {
  return Boolean(
    config.apiKey &&
    config.authDomain &&
    config.projectId &&
    config.appId
  );
}

async function handler(event) {
  if (
    event &&
    event.httpMethod === "OPTIONS"
  ) {
    return {
      statusCode: 200,
      headers:
        headers(event),
      body: ""
    };
  }

  if (
    !event ||
    event.httpMethod !== "GET"
  ) {
    return {
      statusCode: 405,
      headers:
        headers(event),
      body:
        JSON.stringify({
          status:
            "error",
          error:
            "Method Not Allowed"
        })
    };
  }

  const firebaseConfig =
    buildFirebasePublicConfig();

  if (
    !hasCompleteConfig(
      firebaseConfig
    )
  ) {
    return {
      statusCode: 503,
      headers:
        headers(event),
      body:
        JSON.stringify({
          status:
            "error",
          error:
            "Firebase browser configuration is unavailable."
        })
    };
  }

  return {
    statusCode: 200,
    headers:
      headers(event),
    body:
      JSON.stringify({
        status:
          "success",
        firebaseConfig
      })
  };
}

exports.handler =
  handler;

module.exports._test = {
  getAllowedOrigin,
  buildFirebasePublicConfig,
  hasCompleteConfig
};
