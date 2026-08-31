const assert =
  require("node:assert/strict");

const {
  _test
} = require(
  "./firebase-public-config.js"
);

const {
  getAllowedOrigin,
  buildFirebasePublicConfig,
  hasCompleteConfig
} = _test;

function run() {
  console.log(
    "1. known production origin is accepted"
  );

  assert.equal(
    getAllowedOrigin({
      headers: {
        origin:
          "https://www.ryguylabs.com"
      }
    }),
    "https://www.ryguylabs.com"
  );

  console.log(
    "2. arbitrary origin is not reflected"
  );

  assert.equal(
    getAllowedOrigin({
      headers: {
        origin:
          "https://evil.example"
      }
    }),
    "https://www.ryguylabs.com"
  );

  console.log(
    "3. public Firebase config uses expected environment values"
  );

  const config =
    buildFirebasePublicConfig({
      FIREBASE_API_KEY:
        "public-api-key",

      FIREBASE_PROJECT_ID:
        "ryguy-test",

      FIREBASE_APP_ID:
        "test-app-id",

      FIREBASE_AUTH_DOMAIN:
        "auth.example.com"
    });

  assert.deepEqual(
    config,
    {
      apiKey:
        "public-api-key",

      authDomain:
        "auth.example.com",

      projectId:
        "ryguy-test",

      appId:
        "test-app-id"
    }
  );

  console.log(
    "4. authDomain defaults from project ID"
  );

  const defaultDomain =
    buildFirebasePublicConfig({
      FIREBASE_API_KEY:
        "public-api-key",

      FIREBASE_PROJECT_ID:
        "ryguy-test",

      FIREBASE_APP_ID:
        "test-app-id"
    });

  assert.equal(
    defaultDomain.authDomain,
    "ryguy-test.firebaseapp.com"
  );

  console.log(
    "5. complete public config is accepted"
  );

  assert.equal(
    hasCompleteConfig(
      defaultDomain
    ),
    true
  );

  console.log(
    "6. incomplete public config is rejected"
  );

  assert.equal(
    hasCompleteConfig({
      apiKey:
        null,

      authDomain:
        null,

      projectId:
        null,

      appId:
        null
    }),
    false
  );

  console.log("");
  console.log(
    "Firebase Public Config test PASSED."
  );
}

run();
