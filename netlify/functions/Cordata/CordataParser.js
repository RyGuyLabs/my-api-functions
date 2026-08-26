import { CORDATA_FIELD_MAP } from './CordataFieldMap.js';

function sliceField(record, fieldDef) {
  if (!fieldDef || typeof fieldDef.start !== 'number' || typeof fieldDef.end !== 'number') {
    return '';
  }
  if (record.length < fieldDef.end) {
    return '';
  }
  return record.slice(fieldDef.start, fieldDef.end).trim();
}

function sliceRawField(record, fieldDef) {
  if (!fieldDef || typeof fieldDef.start !== 'number' || typeof fieldDef.end !== 'number') {
    return '';
  }
  if (record.length < fieldDef.end) {
    return '';
  }
  return record.slice(fieldDef.start, fieldDef.end);
}

function parseStateAndZip(chunk) {
  if (!chunk) return { state: '', zip: '' };
  const cleaned = chunk.trim();
  if (!cleaned) return { state: '', zip: '' };

  const state = cleaned.slice(0, 2).trim();
  const zip = cleaned.slice(2).trim();

  return { state, zip };
}

export class CordataParser {
  static parseRecord(rawRecord, fieldMap = CORDATA_FIELD_MAP) {
    if (!rawRecord || rawRecord.length < fieldMap.RECORD_LENGTH) {
      throw new Error(
        `Record length ${rawRecord ? rawRecord.length : 0} is less than required ${fieldMap.RECORD_LENGTH}`
      );
    }

    const map = fieldMap;

    // Header / Corporate Identification
    const documentNumber = sliceField(rawRecord, map.header.documentNumber);
    const legalName = sliceField(rawRecord, map.header.legalName);
    const classificationCode = sliceField(rawRecord, map.header.classificationCode);
    const reservedPadding = sliceField(rawRecord, map.header.reservedPadding);
    const filingDate = sliceField(rawRecord, map.header.filingDate);
    const feiNumber = sliceField(rawRecord, map.header.feiNumber);
    const feiStatusRaw = sliceField(rawRecord, map.header.feiStatusRaw);
    const jurisdictionCode = sliceField(rawRecord, map.header.jurisdictionCode);
    const reservedTail = sliceField(rawRecord, map.header.reservedTail);

    const company = {
      documentNumber,
      legalName,
      classificationCode,
      reservedPadding,
      filingDate,
      feiNumber,
      feiStatusRaw,
      jurisdictionCode,
      reservedTail
    };

    // Principal Address
    const principalAddress = {
      address1: sliceField(rawRecord, map.principalAddress.address1),
      city:     sliceField(rawRecord, map.principalAddress.city),
      state:    sliceField(rawRecord, map.principalAddress.state),
      zip:      sliceField(rawRecord, map.principalAddress.zip),
      country:  sliceField(rawRecord, map.principalAddress.country)
    };

    // Mailing Address
    const mailingAddress = {
      address1: sliceField(rawRecord, map.mailingAddress.address1),
      city:     sliceField(rawRecord, map.mailingAddress.city),
      state:    sliceField(rawRecord, map.mailingAddress.state),
      zip:      sliceField(rawRecord, map.mailingAddress.zip),
      country:  sliceField(rawRecord, map.mailingAddress.country)
    };

    const people = [];

    // Slot 1 Processing
    if (map.slot1) {
      const s1 = map.slot1;
      const role = sliceField(rawRecord, s1.code);
      const year = sliceField(rawRecord, s1.year);
      const lastNameOrg = sliceField(rawRecord, s1.lastNameOrg);
      const firstName = sliceField(rawRecord, s1.firstName);
      const middleInitial = sliceField(rawRecord, s1.middleInitial);
      const addressPrefix = sliceField(rawRecord, s1.addressPrefix);
      const street = sliceField(rawRecord, s1.streetAddress);
      const city = sliceField(rawRecord, s1.city);
      const stateZipChunk = sliceField(rawRecord, s1.stateZipChunk);
      const stateZip = parseStateAndZip(stateZipChunk);

      if (
        role ||
        year ||
        lastNameOrg ||
        firstName ||
        middleInitial ||
        street ||
        city ||
        stateZip.state ||
        stateZip.zip
      ) {
        people.push({
          slot: 1,
          role,
          nameRaw: lastNameOrg,
          lastNameOrg,
          firstName,
          middleInitial,
          addressPrefix,
          street,
          city,
          state: stateZip.state,
          zip: stateZip.zip
        });
      }
    }

    // Repeating Slots (Slots 2–7)
    if (map.repeatingSlots) {
      const rs = map.repeatingSlots;
      const sub = rs.subFields;
      const startOffset = rs.startOffset;
      const stride = rs.stride;
      const count = rs.count;

      for (let i = 0; i < count; i++) {
        const slotStart = startOffset + i * stride;
        const slotEnd = slotStart + stride;

        if (rawRecord.length < slotEnd) {
          break;
        }

        const slotChunk = rawRecord.slice(slotStart, slotEnd);

        const role = sliceField(slotChunk, sub.role);
        const entityType = sliceField(slotChunk, sub.entityType);
        const lastNameOrg = sliceField(slotChunk, sub.lastNameOrg);
        const firstName = sliceField(slotChunk, sub.firstName);
        const nameQualifier = sliceField(slotChunk, sub.nameQualifier);
        const addressNumRaw = sliceRawField(slotChunk, sub.addressNum);
        const streetAddressRaw = sliceRawField(slotChunk, sub.streetAddress);
        const city = sliceField(slotChunk, sub.city);
        const stateZipChunk = sliceField(slotChunk, sub.stateZipChunk);

        const roleAndNameRaw = sliceField(slotChunk, {
          start: sub.role.start,
          end: sub.nameQualifier.end
        });

        const street = (addressNumRaw + streetAddressRaw).trim();
        const stateZip = parseStateAndZip(stateZipChunk);

        if (
          role ||
          entityType ||
          lastNameOrg ||
          firstName ||
          nameQualifier ||
          street ||
          city ||
          stateZip.state ||
          stateZip.zip
        ) {
          people.push({
            slot: i + 2,
            role,
            entityType,
            lastNameOrg,
            nameRaw: lastNameOrg,
            firstName,
            firstNameCont: firstName,
            nameQualifier,
            street,
            city,
            state: stateZip.state,
            zip: stateZip.zip,
            roleAndNameRaw
          });
        }
      }
    }

    return {
      rawRecord,
      company,
      principalAddress,
      mailingAddress,
      people
    };
  }
}

export function parseCordataRecord(rawRecord) {
  return CordataParser.parseRecord(rawRecord);
}
