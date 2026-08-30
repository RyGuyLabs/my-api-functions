import { CORDATA_FIELD_MAP } from './CordataFieldMap.js';

function sliceField(record, fieldDef) {
  if (!fieldDef || typeof fieldDef.start !== 'number' || typeof fieldDef.end !== 'number') {
    return '';
  }
  if (record.length < fieldDef.end) {
    return '';
  }

  const chunk = record.slice(fieldDef.start, fieldDef.end);

  return Buffer.isBuffer(chunk)
    ? chunk.toString('utf8').trim()
    : chunk.trim();
}

function sliceRawField(record, fieldDef) {
  if (!fieldDef || typeof fieldDef.start !== 'number' || typeof fieldDef.end !== 'number') {
    return '';
  }
  if (record.length < fieldDef.end) {
    return '';
  }

  const chunk = record.slice(fieldDef.start, fieldDef.end);

  return Buffer.isBuffer(chunk)
    ? chunk.toString('utf8')
    : chunk;
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
    const recordBuffer =
      Buffer.isBuffer(rawRecord)
        ? rawRecord
        : Buffer.from(String(rawRecord || ''), 'utf8');

    if (recordBuffer.length < fieldMap.RECORD_LENGTH) {
      throw new Error(
        `Record byte length ${recordBuffer.length} is less than required ${fieldMap.RECORD_LENGTH}`
      );
    }

    const map = fieldMap;

    // Header / Corporate Identification
    const documentNumber = sliceField(recordBuffer, map.header.documentNumber);
    const legalName = sliceField(recordBuffer, map.header.legalName);
    const classificationCode = sliceField(recordBuffer, map.header.classificationCode);
    const reservedPadding = sliceField(recordBuffer, map.header.reservedPadding);
    const filingDate = sliceField(recordBuffer, map.header.filingDate);
    const feiNumber = sliceField(recordBuffer, map.header.feiNumber);
    const feiStatusRaw = sliceField(recordBuffer, map.header.feiStatusRaw);
    const jurisdictionCode = sliceField(recordBuffer, map.header.jurisdictionCode);
    const reservedTail = sliceField(recordBuffer, map.header.reservedTail);

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
      address1: sliceField(recordBuffer, map.principalAddress.address1),
      city:     sliceField(recordBuffer, map.principalAddress.city),
      state:    sliceField(recordBuffer, map.principalAddress.state),
      zip:      sliceField(recordBuffer, map.principalAddress.zip),
      country:  sliceField(recordBuffer, map.principalAddress.country)
    };

    // Mailing Address
    const mailingAddress = {
      address1: sliceField(recordBuffer, map.mailingAddress.address1),
      city:     sliceField(recordBuffer, map.mailingAddress.city),
      state:    sliceField(recordBuffer, map.mailingAddress.state),
      zip:      sliceField(recordBuffer, map.mailingAddress.zip),
      country:  sliceField(recordBuffer, map.mailingAddress.country)
    };

    const people = [];

    // Slot 1 Processing
    if (map.slot1) {
      const s1 = map.slot1;
      const role = sliceField(recordBuffer, s1.code);
      const year = sliceField(recordBuffer, s1.year);
      const lastNameOrg = sliceField(recordBuffer, s1.lastNameOrg);
      const firstName = sliceField(recordBuffer, s1.firstName);
      const middleInitial = sliceField(recordBuffer, s1.middleInitial);
      const addressPrefix = sliceField(recordBuffer, s1.addressPrefix);
      const street = sliceField(recordBuffer, s1.streetAddress);
      const city = sliceField(recordBuffer, s1.city);
      const stateZipChunk = sliceField(recordBuffer, s1.stateZipChunk);
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

        if (recordBuffer.length < slotEnd) {
          break;
        }

        const slotChunk = recordBuffer.slice(slotStart, slotEnd);

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
