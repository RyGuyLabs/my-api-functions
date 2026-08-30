const {
  toCanonicalString
} = require("../source/CanonicalSerializer.js");

const {
  buildNormalizedChangeEvent
} = require("./NormalizedChangeEvent.js");

function normalizePerson(person) {
  const p =
    typeof person === "string"
      ? { name: person }
      : (person || {});

  const address =
    p.address || {};

  return {
    title:
      p.person_title ||
      p.title ||
      p.personTitle ||
      null,

    name:
      p.name ||
      p.person_name ||
      null,

    address_line1:
      address.line1 ||
      address.address1 ||
      p.address_line1 ||
      p.addressLine1 ||
      null,

    address_line2:
      address.line2 ||
      address.address2 ||
      p.address_line2 ||
      p.addressLine2 ||
      null,

    city:
      address.city ||
      p.city ||
      null,

    state:
      address.state ||
      p.state ||
      null,

    zip:
      address.zip ||
      p.zip ||
      null
  };
}

function normalizePeople(people = []) {
  return people
    .map(normalizePerson)
    .filter(person => person.name)
    .sort((left, right) => {
      const leftCanonical =
        toCanonicalString(left);

      const rightCanonical =
        toCanonicalString(right);

      if (leftCanonical < rightCanonical) {
        return -1;
      }

      if (leftCanonical > rightCanonical) {
        return 1;
      }

      return 0;
    });
}

function detectPeopleChanges({
  entityId,
  beforePeople = [],
  afterPeople = [],
  detectedAt,
  effectiveAt = null,
  sourceType = "official_state_dataset",
  sourceReference = null,
  evidenceHash = null
}) {
  if (!entityId) {
    throw new Error(
      "PeopleChangeDetector requires entityId."
    );
  }

  const before =
    normalizePeople(beforePeople);

  const after =
    normalizePeople(afterPeople);

  const beforeMap =
    new Map(
      before.map(person => [
        toCanonicalString(person),
        person
      ])
    );

  const afterMap =
    new Map(
      after.map(person => [
        toCanonicalString(person),
        person
      ])
    );

  const events = [];

  for (const [key, person] of beforeMap) {
    if (!afterMap.has(key)) {
      events.push(
        buildNormalizedChangeEvent({
          entityId,
          eventType:
            "OFFICER_REMOVED",
          detectedAt,
          effectiveAt,
          sourceType,
          sourceReference:
            sourceReference || {
              registrationId: entityId
            },
          before: person,
          after: null,
          evidenceHash
        })
      );
    }
  }

  for (const [key, person] of afterMap) {
    if (!beforeMap.has(key)) {
      events.push(
        buildNormalizedChangeEvent({
          entityId,
          eventType:
            "OFFICER_ADDED",
          detectedAt,
          effectiveAt,
          sourceType,
          sourceReference:
            sourceReference || {
              registrationId: entityId
            },
          before: null,
          after: person,
          evidenceHash
        })
      );
    }
  }

  return events;
}

module.exports = {
  normalizePerson,
  normalizePeople,
  detectPeopleChanges
};
