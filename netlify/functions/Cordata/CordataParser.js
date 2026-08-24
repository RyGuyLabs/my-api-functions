cat << 'EOF' > cordata/CordataParser.js
import { CORDATA_FIELD_MAP } from './CordataFieldMap.js';

/**
 * Validate that the incoming Cordata record is exactly the
 * expected fixed-width length.
 */
function assertRecordLength(rawRecord) {
  const expectedLength = CORDATA_FIELD_MAP.RECORD_LENGTH;

  if (!rawRecord || rawRecord.length !== expectedLength) {
    throw new Error(
      `Invalid record length: expected ${expectedLength}, got ${rawRecord?.length || 0}`
    );
  }
}

/**
 * Safely extract and trim a fixed-width field.
 */
function sliceField(rawRecord, field) {
  if (!field || typeof field.start !== 'number' || typeof field.end !== 'number') {
    throw new Error('Invalid field-map definition');
  }

  return rawRecord.slice(field.start, field.end).trim();
}

/**
 * Parse a combined state/ZIP region such as:
 *   FL34223
 *   FL 34223
 *   FL34223
 */
function parseStateAndZip(rawRegion) {
  const cleaned = String(rawRegion || '').replace(/\s+/g, '');

  const match = cleaned.match(/^([A-Z]{2})(\d{5}(?:-\d{4})?)$/);

  if (match) {
    return {
      state: match[1],
      zip: match[2]
    };
  }

  return {
    state: cleaned.slice(0, 2) || '',
    zip: cleaned.slice(2) || ''
  };
}

/**
 * Parse corporate header.
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
 * Parse principal address.
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
 * Parse the primary person slot.
 *
 * Slot 1 occupies the fixed region beginning at offset 536.
 */
function parseSlot1(rawRecord) {
  const map = CORDATA_FIELD_MAP.slot1;

  const lastNameOrg = sliceField(rawRecord, map.lastNameOrg);

  if (!lastNameOrg) {
    return null;
  }

  const stateZipChunk = rawRecord.slice(
    map.stateZipChunk.start,
    map.stateZipChunk.end
  );

  const { state, zip } = parseStateAndZip(stateZipChunk);

  const firstName = sliceField(rawRecord, map.firstName);
  const middleInitial = sliceField(rawRecord, map.middleInitial);
  const addressPrefix = sliceField(rawRecord, map.addressPrefix);
  const streetAddress = sliceField(rawRecord, map.streetAddress);
  const city = sliceField(rawRecord, map.city);

  return {
    slot: 1,
    role: 'PRIMARY',

    // Preserve both normalized and compatibility names.
    nameRaw: lastNameOrg,
    lastNameOrg,
    firstName: firstName || null,
    middleInitial: middleInitial || null,

    addressPrefix: addressPrefix || null,
    street: streetAddress,
    city,
    state,
    zip
  };
}

/**
 * Parse repeating relationship slots 2-7.
 *
 * IMPORTANT:
 * The field map now separates:
 *
 *   role
 *   lastNameOrg
 *   firstNameCont
 *
 * Therefore the parser must NOT reference:
 *
 *   rep.subFields.roleAndName
 */
function parseRepeatingSlots(rawRecord) {
  const people = [];
  const map = CORDATA_FIELD_MAP.repeatingSlots;

  for (let i = 0; i < map.count; i++) {
    const slot = i + 2;

    const slotStart = map.startOffset + (i * map.stride);
    const slotEnd = slotStart + map.stride;

    const slotChunk = rawRecord.slice(slotStart, slotEnd);

    // Completely empty slot.
    if (!slotChunk.trim()) {
      continue;
    }

    const role = slotChunk
      .slice(
        map.subFields.role.start,
        map.subFields.role.end
      )
      .trim();

    const lastNameOrg = slotChunk
      .slice(
        map.subFields.lastNameOrg.start,
        map.subFields.lastNameOrg.end
      )
      .trim();

    const firstNameCont = slotChunk
      .slice(
        map.subFields.firstNameCont.start,
        map.subFields.firstNameCont.end
      )
      .trim();

    /*
     * A slot with no identity information is not a person.
     */
    if (!role && !lastNameOrg && !firstNameCont) {
      continue;
    }

    const addressNum = slotChunk
      .slice(
        map.subFields.addressNum.start,
        map.subFields.addressNum.end
      )
      .trim();

    const streetAddress = slotChunk
      .slice(
        map.subFields.streetAddress.start,
        map.subFields.streetAddress.end
      )
      .trim();

    const city = slotChunk
      .slice(
        map.subFields.city.start,
        map.subFields.city.end
      )
      .trim();

    const stateZipChunk = slotChunk.slice(
      map.subFields.stateZipChunk.start,
      map.subFields.stateZipChunk.end
    );

    const { state, zip } = parseStateAndZip(stateZipChunk);

    const street = `${addressNum} ${streetAddress}`.trim();

    people.push({
      slot,

      role: role || null,

      // Keep the new normalized field.
      lastNameOrg: lastNameOrg || null,

      // Keep the old compatibility field because
      // CordataProvider.js currently references nameRaw.
      nameRaw: lastNameOrg || null,

      firstName: firstNameCont || null,

      firstNameCont: firstNameCont || null,

      street,
      city,
      state,
      zip,

      // Useful raw identity representation.
      roleAndNameRaw: [role, lastNameOrg]
        .filter(Boolean)
        .join(' ')
        .trim() || null
    });
  }

  return people;
}

/**
 * Parse complete 1,440-character Cordata record.
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

/**
 * Optional class wrapper for compatibility with the older
 * test-cordata.js architecture.
 *
 * This means BOTH of these forms work:
 *
 *   parseCordataRecord(raw)
 *
 * and:
 *
 *   CordataParser.parseRecord(raw)
 */
export class CordataParser {
  static parseRecord(rawRecord) {
    const parsed = parseCordataRecord(rawRecord);

    return {
      registrationId: parsed.company.documentNumber,
      legalName: parsed.company.legalName,
      status: parsed.company.status,
      entityType: parsed.company.entityType,
      filingDate: parsed.company.filingDate,
      effectiveDate: parsed.company.effectiveDate,
      feiNumber: parsed.company.feiNumber,
      state: parsed.company.state,

      principalAddress: parsed.principalAddress,
      mailingAddress: parsed.mailingAddress,

      associatedPeople: parsed.people
    };
  }
}
EOF
