```javascript
import { CORDATA_FIELD_MAP } from './CordataFieldMap.js';

/**
 * Validate that the source is exactly one complete Cordata record.
 */
function assertRecordLength(rawRecord) {
  const expected = CORDATA_FIELD_MAP.RECORD_LENGTH;

  if (!rawRecord || rawRecord.length !== expected) {
    throw new Error(
      `Invalid Cordata record length: expected ${expected}, got ${rawRecord?.length || 0}`
    );
  }
}

/**
 * Safely extract and trim a fixed-width field.
 */
function sliceField(rawRecord, field) {
  return rawRecord.slice(field.start, field.end).trim();
}

/**
 * Parse a combined state/ZIP region.
 *
 * Cordata can contain padding between the state and ZIP,
 * so whitespace is removed before attempting extraction.
 */
function parseStateAndZip(rawRegion) {
  if (!rawRegion) {
    return {
      state: '',
      zip: ''
    };
  }

  const cleaned = rawRegion.replace(/\s+/g, '');

  const match = cleaned.match(
    /^([A-Z]{2})(\d{5}(?:-\d{4})?)$/
  );

  if (match) {
    return {
      state: match[1],
      zip: match[2]
    };
  }

  /*
   * Fallback for malformed or partially populated regions.
   * Do not manufacture data.
   */
  return {
    state: cleaned.slice(0, 2),
    zip: cleaned.slice(2)
  };
}

/**
 * Parse corporate identity/header fields.
 */
function parseCorporateHeader(rawRecord) {
  const map = CORDATA_FIELD_MAP.header;

  return {
    documentNumber: sliceField(rawRecord, map.documentNumber),
    legalName: sliceField(rawRecord, map.legalName),
    status: sliceField(rawRecord, map.status),
    entityType: sliceField(rawRecord, map.entityType),
    filingDate: sliceField(rawRecord, map.filingDate),
    effectiveDate: sliceField(rawRecord, map.effectiveDate),
    feiNumber: sliceField(rawRecord, map.feiNumber),
    state: sliceField(rawRecord, map.state)
  };
}

/**
 * Parse principal business address.
 */
function parsePrincipalAddress(rawRecord) {
  const map = CORDATA_FIELD_MAP.principalAddress;

  return {
    street: sliceField(rawRecord, map.address1),
    city: sliceField(rawRecord, map.city),
    state: sliceField(rawRecord, map.state),
    zip: sliceField(rawRecord, map.zip)
  };
}

/**
 * Parse mailing address.
 */
function parseMailingAddress(rawRecord) {
  const map = CORDATA_FIELD_MAP.mailingAddress;

  return {
    street: sliceField(rawRecord, map.address1),
    city: sliceField(rawRecord, map.city),
    state: sliceField(rawRecord, map.state),
    zip: sliceField(rawRecord, map.zip)
  };
}

/**
 * Parse Slot 1.
 *
 * Slot 1 has its own structure and is not part of the
 * repeating 128-byte relationship slots.
 */
function parseSlot1(rawRecord) {
  const map = CORDATA_FIELD_MAP.slot1;

  const lastNameOrg = sliceField(rawRecord, map.lastNameOrg);

  /*
   * Empty Slot 1 should not produce a person object.
   */
  if (!lastNameOrg) {
    return null;
  }

  const stateZipChunk = rawRecord.slice(
    map.stateZipChunk.start,
    map.stateZipChunk.end
  );

  const { state, zip } = parseStateAndZip(stateZipChunk);

  return {
    slot: 1,
    role: 'PRIMARY',
    code: sliceField(rawRecord, map.code) || null,
    year: sliceField(rawRecord, map.year) || null,
    nameRaw: lastNameOrg,
    firstName: sliceField(rawRecord, map.firstName) || null,
    middleInitial: sliceField(rawRecord, map.middleInitial) || null,
    addressPrefix: sliceField(rawRecord, map.addressPrefix) || null,
    street: sliceField(rawRecord, map.streetAddress),
    city: sliceField(rawRecord, map.city),
    state,
    zip
  };
}

/**
 * Parse repeating relationship slots 2 through 7.
 *
 * Each slot is exactly 128 bytes.
 */
function parseRepeatingSlots(rawRecord) {
  const people = [];
  const map = CORDATA_FIELD_MAP.repeatingSlots;

  for (let i = 0; i < map.count; i++) {
    const slotNumber = i + 2;

    const slotStart =
      map.startOffset + (i * map.stride);

    const slotEnd =
      slotStart + map.stride;

    const slotChunk =
      rawRecord.slice(slotStart, slotEnd);

    /*
     * Completely empty relationship slot.
     */
    if (!slotChunk.trim()) {
      continue;
    }

    const fields = map.subFields;

    const role = slotChunk
      .slice(fields.role.start, fields.role.end)
      .trim();

    const lastNameOrg = slotChunk
      .slice(fields.lastNameOrg.start, fields.lastNameOrg.end)
      .trim();

    const firstNameCont = slotChunk
      .slice(fields.firstNameCont.start, fields.firstNameCont.end)
      .trim();

    /*
     * A slot with no identity information is not a person.
     */
    if (!role && !lastNameOrg && !firstNameCont) {
      continue;
    }

    const addressNum = slotChunk
      .slice(fields.addressNum.start, fields.addressNum.end)
      .trim();

    const streetAddress = slotChunk
      .slice(fields.streetAddress.start, fields.streetAddress.end)
      .trim();

    const city = slotChunk
      .slice(fields.city.start, fields.city.end)
      .trim();

    const stateZipChunk = slotChunk.slice(
      fields.stateZipChunk.start,
      fields.stateZipChunk.end
    );

    const { state, zip } =
      parseStateAndZip(stateZipChunk);

    people.push({
      slot: slotNumber,
      role: role || null,
      lastNameOrg: lastNameOrg || null,
      firstName: firstNameCont || null,
      addressNumber: addressNum || null,
      street: `${addressNum} ${streetAddress}`.trim(),
      city: city || null,
      state: state || null,
      zip: zip || null
    });
  }

  return people;
}

/**
 * Public Cordata parser.
 *
 * Input:
 *   Exactly one 1,440-character Cordata record.
 *
 * Output:
 *   Raw evidence + normalized corporate/address/person structures.
 */
export function parseCordataRecord(rawRecord) {
  assertRecordLength(rawRecord);

  const slot1 = parseSlot1(rawRecord);
  const repeatingPeople = parseRepeatingSlots(rawRecord);

  const people = [
    ...(slot1 ? [slot1] : []),
    ...repeatingPeople
  ];

  return {
    rawRecord,

    company: parseCorporateHeader(rawRecord),

    principalAddress: parsePrincipalAddress(rawRecord),

    mailingAddress: parseMailingAddress(rawRecord),

    people
  };
}
```
