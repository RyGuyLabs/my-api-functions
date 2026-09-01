const admin =
  require("firebase-admin");

const {
  CustomerProspectStateStore
} = require(
  "./customer-state/CustomerProspectStateStore.js"
);

try {
  if (
    !admin.apps.length &&
    process.env.FIREBASE_SERVICE_ACCOUNT
  ) {
    admin.initializeApp({
      credential:
        admin.credential.cert(
          JSON.parse(
            process.env.FIREBASE_SERVICE_ACCOUNT
          )
        )
    });
  }
} catch (error) {
  console.error(
    "Prospect qualify Firebase initialization failed:",
    error.message
  );
}

const ALLOWED_ORIGIN =
  "https://www.ryguylabs.com";

const VALID_STATUSES =
  new Set([
    "NEW",
    "QUALIFIED",
    "CONTACTED",
    "FOLLOW_UP",
    "WON",
    "LOST"
  ]);

const VALID_PRIORITIES =
  new Set([
    "LOW",
    "MEDIUM",
    "HIGH",
    "CRITICAL"
  ]);

function headers() {
  return {
    "Access-Control-Allow-Origin":
      ALLOWED_ORIGIN,

    "Access-Control-Allow-Headers":
      "Content-Type, Authorization",

    "Access-Control-Allow-Methods":
      "POST, OPTIONS",

    "Content-Type":
      "application/json"
  };
}

function jsonResponse(
  statusCode,
  payload
) {
  return {
    statusCode,
    headers:
      headers(),
    body:
      JSON.stringify(payload)
  };
}

function parseBody(
  body
) {
  let parsed;

  try {
    parsed =
      typeof body === "string"
        ? JSON.parse(body)
        : body;
  } catch {
    const error =
      new Error(
        "Invalid JSON request body."
      );

    error.statusCode = 400;

    throw error;
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  ) {
    const error =
      new Error(
        "Request body must be a JSON object."
      );

    error.statusCode = 400;

    throw error;
  }

  return parsed;
}

function cleanString(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const clean =
    String(value)
      .replace(/\s+/g, " ")
      .trim();

  return clean || null;
}

function requireString(
  value,
  fieldName
) {
  const clean =
    cleanString(
      value
    );

  if (!clean) {
    const error =
      new Error(
        `${fieldName} is required.`
      );

    error.statusCode = 400;

    throw error;
  }

  return clean;
}

function normalizeEnum(
  value,
  fieldName,
  allowedValues
) {
  const clean =
    requireString(
      value,
      fieldName
    )
      .toUpperCase();

  if (
    !allowedValues.has(
      clean
    )
  ) {
    const error =
      new Error(
        `${fieldName} is invalid.`
      );

    error.statusCode = 400;

    throw error;
  }

  return clean;
}

function normalizeEstimatedValue(
  value
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const parsed =
    Number(
      value
    );

  if (
    !Number.isFinite(parsed) ||
    parsed < 0
  ) {
    const error =
      new Error(
        "estimatedValue must be a non-negative number."
      );

    error.statusCode = 400;

    throw error;
  }

  return parsed;
}

function normalizeFollowUpDate(
  value
) {
  const clean =
    cleanString(
      value
    );

  if (!clean) {
    return null;
  }

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      clean
    )
  ) {
    const error =
      new Error(
        "followUpDate must use YYYY-MM-DD format."
      );

    error.statusCode = 400;

    throw error;
  }

  const parsed =
    new Date(
      `${clean}T00:00:00Z`
    );

  if (
    Number.isNaN(
      parsed.getTime()
    ) ||
    parsed
      .toISOString()
      .slice(0, 10) !==
        clean
  ) {
    const error =
      new Error(
        "followUpDate is invalid."
      );

    error.statusCode = 400;

    throw error;
  }

  return clean;
}

function validateRequest(
  body
) {
  const prospect =
    body.prospect;

  const qualification =
    body.qualification;

  if (
    !prospect ||
    typeof prospect !==
      "object" ||
    Array.isArray(
      prospect
    )
  ) {
    const error =
      new Error(
        "prospect is required."
      );

    error.statusCode = 400;

    throw error;
  }

  if (
    !qualification ||
    typeof qualification !==
      "object" ||
    Array.isArray(
      qualification
    )
  ) {
    const error =
      new Error(
        "qualification is required."
      );

    error.statusCode = 400;

    throw error;
  }

  const cleanProspect = {
    prospectName:
      requireString(
        prospect.prospectName,
        "prospect.prospectName"
      ),

    candidateName:
      cleanString(
        prospect.candidateName
      ),

    candidateDomain:
      cleanString(
        prospect.candidateDomain
      ),

    website:
      cleanString(
        prospect.website
      ),

    registrationId:
      cleanString(
        prospect.registrationId
      )
  };

  const hasStableIdentity =
    Boolean(
      cleanProspect.registrationId ||
      cleanProspect.candidateDomain ||
      cleanProspect.website ||
      cleanProspect.prospectName
    );

  if (!hasStableIdentity) {
    const error =
      new Error(
        "A stable prospect identity is required."
      );

    error.statusCode = 400;

    throw error;
  }

  return {
    prospect:
      cleanProspect,

    qualification: {
      status:
        normalizeEnum(
          qualification.status,
          "qualification.status",
          VALID_STATUSES
        ),

      priority:
        normalizeEnum(
          qualification.priority,
          "qualification.priority",
          VALID_PRIORITIES
        ),

      estimatedValue:
        normalizeEstimatedValue(
          qualification.estimatedValue
        ),

      timing:
        cleanString(
          qualification.timing
        ),

      nextAction:
        cleanString(
          qualification.nextAction
        ),

      followUpDate:
        normalizeFollowUpDate(
          qualification.followUpDate
        ),

      contactName:
        cleanString(
          qualification.contactName
        ),

      contactRole:
        cleanString(
          qualification.contactRole
        ),

      notes:
        cleanString(
          qualification.notes
        )
    }
  };
}

async function verifyFirebaseIdToken(
  idToken
) {
  if (!admin.apps.length) {
    throw new Error(
      "Firebase Admin is not initialized."
    );
  }

  return admin
    .auth()
    .verifyIdToken(
      idToken,
      true
    );
}

function getBearerToken(
  event
) {
  const authorization =
    event &&
    event.headers &&
    (
      event.headers.authorization ||
      event.headers.Authorization
    );

  if (
    typeof authorization !==
      "string" ||
    !authorization.startsWith(
      "Bearer "
    )
  ) {
    return null;
  }

  const token =
    authorization
      .substring(
        "Bearer ".length
      )
      .trim();

  return token || null;
}

let runtimeStore =
  null;

function getRuntimeStore() {
  if (runtimeStore) {
    return runtimeStore;
  }

  if (!admin.apps.length) {
    throw new Error(
      "Firebase Admin is not initialized."
    );
  }

  runtimeStore =
    new CustomerProspectStateStore({
      db:
        admin.firestore(),

      serverTimestamp:
        () =>
          admin.firestore
            .FieldValue
            .serverTimestamp()
    });

  return runtimeStore;
}

function createHandler({
  verifyIdToken =
    verifyFirebaseIdToken,

  getStore =
    getRuntimeStore
} = {}) {
  return async function handler(
    event
  ) {
    if (
      event &&
      event.httpMethod === "OPTIONS"
    ) {
      return {
        statusCode: 200,
        headers:
          headers(),
        body: ""
      };
    }

    if (
      !event ||
      event.httpMethod !== "POST"
    ) {
      return jsonResponse(
        405,
        {
          status:
            "error",
          error:
            "Method Not Allowed"
        }
      );
    }

    const token =
      getBearerToken(
        event
      );

    if (!token) {
      return jsonResponse(
        401,
        {
          status:
            "error",
          error:
            "Authentication required."
        }
      );
    }

    let decodedUser;

    try {
      decodedUser =
        await verifyIdToken(
          token
        );
    } catch {
      return jsonResponse(
        401,
        {
          status:
            "error",
          error:
            "Invalid Firebase token."
        }
      );
    }

    if (
      !decodedUser ||
      !decodedUser.uid
    ) {
      return jsonResponse(
        401,
        {
          status:
            "error",
          error:
            "Invalid Firebase token."
        }
      );
    }

    try {
      const request =
        validateRequest(
          parseBody(
            event.body
          )
        );

      const store =
        getStore();

      const savedState =
        await store.saveQualification({
          uid:
            decodedUser.uid,

          prospect:
            request.prospect,

          qualification:
            request.qualification
        });

      return jsonResponse(
        200,
        {
          status:
            "success",

          prospectKey:
            savedState.prospectKey,

          customerState:
            savedState
        }
      );

    } catch (error) {
      const statusCode =
        Number.isInteger(
          error &&
          error.statusCode
        )
          ? error.statusCode
          : 500;

      if (
        statusCode >= 500
      ) {
        console.error(
          "Prospect qualify error:",
          error
        );
      }

      return jsonResponse(
        statusCode,
        {
          status:
            "error",

          error:
            statusCode >= 500
              ? "An error occurred while saving prospect qualification."
              : error.message
        }
      );
    }
  };
}

const handler =
  createHandler();

exports.handler =
  handler;

module.exports._test = {
  parseBody,
  cleanString,
  normalizeEnum,
  normalizeEstimatedValue,
  normalizeFollowUpDate,
  validateRequest,
  getBearerToken,
  createHandler,
  VALID_STATUSES,
  VALID_PRIORITIES
};
