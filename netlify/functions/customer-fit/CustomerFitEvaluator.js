function normalizeString(value) {
  if (value == null) {
    return null;
  }

  const normalized =
    String(value).trim();

  return normalized || null;
}

function normalizeUpper(value) {
  const normalized =
    normalizeString(value);

  return normalized
    ? normalized.toUpperCase()
    : null;
}

function normalizeLower(value) {
  const normalized =
    normalizeString(value);

  return normalized
    ? normalized.toLowerCase()
    : null;
}

function normalizeList(
  values,
  normalizer = normalizeString
) {
  if (!Array.isArray(values)) {
    return [];
  }

  return [
    ...new Set(
      values
        .map(normalizer)
        .filter(Boolean)
    )
  ];
}

function validateProfile(profile) {
  if (
    !profile ||
    typeof profile !== "object" ||
    Array.isArray(profile)
  ) {
    throw new Error(
      "CustomerFitEvaluator requires a customer profile."
    );
  }

  if (
    !Array.isArray(
      profile.targetCommercialEventTypes
    ) ||
    profile.targetCommercialEventTypes.length === 0
  ) {
    throw new Error(
      "Customer profile requires at least one target commercial event type."
    );
  }

  const rawMaxSignalAgeHours =
    profile.maxSignalAgeHours;

  const maxSignalAgeHours =
    Number(rawMaxSignalAgeHours);

  if (
    rawMaxSignalAgeHours === null ||
    rawMaxSignalAgeHours === undefined ||
    rawMaxSignalAgeHours === "" ||
    !Number.isFinite(maxSignalAgeHours) ||
    maxSignalAgeHours < 0
  ) {
    throw new Error(
      "Customer profile requires a non-negative maxSignalAgeHours."
    );
  }
}

function matchesGeography(
  geographyProfile = {},
  entityContext = {}
) {
  const states =
    normalizeList(
      geographyProfile.states,
      normalizeUpper
    );

  const cities =
    normalizeList(
      geographyProfile.cities,
      normalizeLower
    );

  const counties =
    normalizeList(
      geographyProfile.counties,
      normalizeLower
    );

  const zips =
    normalizeList(
      geographyProfile.zips,
      normalizeString
    );

  const hasRule =
    states.length > 0 ||
    cities.length > 0 ||
    counties.length > 0 ||
    zips.length > 0;

  if (!hasRule) {
    return true;
  }

  const location =
    entityContext.location || {};

  const state =
    normalizeUpper(
      location.state ||
      entityContext.state ||
      entityContext.jurisdiction
    );

  const city =
    normalizeLower(
      location.city ||
      entityContext.city
    );

  const county =
    normalizeLower(
      location.county ||
      entityContext.county
    );

  const zip =
    normalizeString(
      location.zip ||
      entityContext.zip
    );

  if (
    states.length > 0 &&
    !states.includes(state)
  ) {
    return false;
  }

  if (
    cities.length > 0 &&
    !cities.includes(city)
  ) {
    return false;
  }

  if (
    counties.length > 0 &&
    !counties.includes(county)
  ) {
    return false;
  }

  if (
    zips.length > 0 &&
    !zips.includes(zip)
  ) {
    return false;
  }

  return true;
}

function matchesIndustryClassification(
  profileClassifications,
  entityContext = {}
) {
  const targets =
    normalizeList(
      profileClassifications,
      normalizeUpper
    );

  if (targets.length === 0) {
    return true;
  }

  const entityClassifications =
    normalizeList(
      [
        entityContext.classificationCode,
        ...(Array.isArray(
          entityContext.classifications
        )
          ? entityContext.classifications
          : [])
      ],
      normalizeUpper
    );

  return targets.some(
    target =>
      entityClassifications.includes(target)
  );
}

function matchesEntityType(
  profileEntityTypes,
  entityContext = {}
) {
  const targets =
    normalizeList(
      profileEntityTypes,
      normalizeUpper
    );

  if (targets.length === 0) {
    return true;
  }

  const entityType =
    normalizeUpper(
      entityContext.entityType
    );

  return targets.includes(
    entityType
  );
}

function calculateSignalAgeHours({
  commercialEvent,
  asOf
}) {
  const signalTimestamp =
    commercialEvent.occurredAt ||
    commercialEvent.detectedAt;

  if (!signalTimestamp) {
    return null;
  }

  const signalTime =
    new Date(signalTimestamp);

  const evaluationTime =
    new Date(asOf);

  if (
    Number.isNaN(signalTime.getTime()) ||
    Number.isNaN(evaluationTime.getTime())
  ) {
    throw new Error(
      "CustomerFitEvaluator requires valid signal and evaluation timestamps."
    );
  }

  return (
    evaluationTime.getTime() -
    signalTime.getTime()
  ) / 3600000;
}

function evaluateCustomerFit({
  commercialEvent,
  entityContext = {},
  customerProfile,
  asOf = new Date().toISOString()
}) {
  if (
    !commercialEvent ||
    typeof commercialEvent !== "object"
  ) {
    throw new Error(
      "CustomerFitEvaluator requires a commercial event."
    );
  }

  if (!commercialEvent.commercialEventType) {
    throw new Error(
      "Commercial event requires commercialEventType."
    );
  }

  validateProfile(customerProfile);

  const reasonCodes = [];
  const failedReasonCodes = [];

  const geographyMatch =
    matchesGeography(
      customerProfile.geography,
      entityContext
    );

  (
    geographyMatch
      ? reasonCodes
      : failedReasonCodes
  ).push(
    geographyMatch
      ? "GEOGRAPHY_MATCH"
      : "GEOGRAPHY_MISMATCH"
  );

  const classificationMatch =
    matchesIndustryClassification(
      customerProfile.industryClassifications,
      entityContext
    );

  (
    classificationMatch
      ? reasonCodes
      : failedReasonCodes
  ).push(
    classificationMatch
      ? "CLASSIFICATION_MATCH"
      : "CLASSIFICATION_MISMATCH"
  );

  const entityTypeMatch =
    matchesEntityType(
      customerProfile.entityTypes,
      entityContext
    );

  (
    entityTypeMatch
      ? reasonCodes
      : failedReasonCodes
  ).push(
    entityTypeMatch
      ? "ENTITY_TYPE_MATCH"
      : "ENTITY_TYPE_MISMATCH"
  );

  const targetEventTypes =
    normalizeList(
      customerProfile.targetCommercialEventTypes,
      normalizeUpper
    );

  const eventTypeMatch =
    targetEventTypes.includes(
      normalizeUpper(
        commercialEvent.commercialEventType
      )
    );

  (
    eventTypeMatch
      ? reasonCodes
      : failedReasonCodes
  ).push(
    eventTypeMatch
      ? "EVENT_TYPE_MATCH"
      : "EVENT_TYPE_MISMATCH"
  );

  const signalAgeHours =
    calculateSignalAgeHours({
      commercialEvent,
      asOf
    });

  const signalAgeMatch =
    signalAgeHours !== null &&
    signalAgeHours >= 0 &&
    signalAgeHours <=
      Number(
        customerProfile.maxSignalAgeHours
      );

  (
    signalAgeMatch
      ? reasonCodes
      : failedReasonCodes
  ).push(
    signalAgeMatch
      ? "SIGNAL_AGE_MATCH"
      : "SIGNAL_AGE_MISMATCH"
  );

  return Object.freeze({
    profileId:
      customerProfile.profileId ||
      null,

    entityId:
      commercialEvent.entityId ||
      null,

    commercialEventType:
      commercialEvent.commercialEventType,

    matched:
      failedReasonCodes.length === 0,

    reasonCodes,

    failedReasonCodes,

    signalAgeHours
  });
}

module.exports = {
  evaluateCustomerFit,
  matchesGeography,
  matchesIndustryClassification,
  matchesEntityType,
  calculateSignalAgeHours
};
