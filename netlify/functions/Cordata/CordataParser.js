import crypto from 'crypto';
import { CORDATA_FIELD_MAP } from './CordataFieldMap.js';

function sliceField(rawRecord, start, end) {
  return rawRecord.slice(start, end).trim();
}

function parseStateAndZip(rawRegion) {
  const cleaned = rawRegion.replace(/\s+/g, '');
  const match = cleaned.match(/([A-Z]{2})(\d{5}(?:-\d{4})?)/);
  if (match) {
    return { state: match[1], zip: match[2] };
  }
  return { state: rawRegion.slice(0, 2).trim(), zip: rawRegion.slice(2).trim() };
}

export function parseCordataRecord(rawRecord) {
  if (!rawRecord || rawRecord.length !== 1440) {
    throw new Error(`Invalid record length: expected 1440, got ${rawRecord?.length || 0}`);
  }

  const hash = crypto.createHash('sha256').update(rawRecord).digest('hex');

  const headerMap = CORDATA_FIELD_MAP.header;
  const company = {
    documentNumber: sliceField(rawRecord, headerMap.documentNumber.start, headerMap.documentNumber.end),
    legalName:      sliceField(rawRecord, headerMap.legalName.start, headerMap.legalName.end),
    status:         sliceField(rawRecord, headerMap.status.start, headerMap.status.end),
    entityType:     sliceField(rawRecord, headerMap.entityType.start, headerMap.entityType.end),
    filingDate:     sliceField(rawRecord, headerMap.filingDate.start, headerMap.filingDate.end),
    effectiveDate:  sliceField(rawRecord, headerMap.effectiveDate.start, headerMap.effectiveDate.end),
    feiNumber:      sliceField(rawRecord, headerMap.feiNumber.start, headerMap.feiNumber.end),
    state:          sliceField(rawRecord, headerMap.state.start, headerMap.state.end)
  };

  const pMap = CORDATA_FIELD_MAP.principalAddress;
  const principalAddress = {
    street: sliceField(rawRecord, pMap.address1.start, pMap.address1.end),
    city:   sliceField(rawRecord, pMap.city.start, pMap.city.end),
    state:  sliceField(rawRecord, pMap.state.start, pMap.state.end),
    zip:    sliceField(rawRecord, pMap.zip.start, pMap.zip.end)
  };

  const mMap = CORDATA_FIELD_MAP.mailingAddress;
  const mailingAddress = {
    street: sliceField(rawRecord, mMap.address1.start, mMap.address1.end),
    city:   sliceField(rawRecord, mMap.city.start, mMap.city.end),
    state:  sliceField(rawRecord, mMap.state.start, mMap.state.end),
    zip:    sliceField(rawRecord, mMap.zip.start, mMap.zip.end)
  };

  const people = [];

  // Slot 1
  const s1 = CORDATA_FIELD_MAP.slot1;
  const s1LastNameOrg = sliceField(rawRecord, s1.lastNameOrg.start, s1.lastNameOrg.end);
  if (s1LastNameOrg) {
    const { state, zip } = parseStateAndZip(rawRecord.slice(s1.stateZipChunk.start, s1.stateZipChunk.end));
    people.push({
      slot: 1,
      role: 'PRIMARY',
      rawIdentifier: s1LastNameOrg,
      firstName: sliceField(rawRecord, s1.firstName.start, s1.firstName.end) || null,
      lastNameOrOrg: s1LastNameOrg,
      street: sliceField(rawRecord, s1.streetAddress.start, s1.streetAddress.end),
      city: sliceField(rawRecord, s1.city.start, s1.city.end),
      state,
      zip
    });
  }

  // Slots 2-7
  const rep = CORDATA_FIELD_MAP.repeatingSlots;
  for (let i = 0; i < rep.count; i++) {
    const slotStart = rep.startOffset + (i * rep.stride);
    const slotChunk = rawRecord.slice(slotStart, slotStart + rep.stride);
    if (!slotChunk.trim()) continue;

    const roleAndName = slotChunk.slice(rep.subFields.roleAndName.start, rep.subFields.roleAndName.end).trim();
    if (!roleAndName) continue;

    const { state, zip } = parseStateAndZip(slotChunk.slice(rep.subFields.stateZipChunk.start, rep.subFields.stateZipChunk.end));
    const addressNum = slotChunk.slice(rep.subFields.addressNum.start, rep.subFields.addressNum.end).trim();
    const streetCont = slotChunk.slice(rep.subFields.streetAddress.start, rep.subFields.streetAddress.end).trim();

    people.push({
      slot: i + 2,
      role: null,
      rawIdentifier: roleAndName,
      firstName: slotChunk.slice(rep.subFields.firstNameCont.start, rep.subFields.firstNameCont.end).trim() || null,
      lastNameOrOrg: roleAndName,
      street: `${addressNum} ${streetCont}`.trim(),
      city: slotChunk.slice(rep.subFields.city.start, rep.subFields.city.end).trim(),
      state,
      zip
    });
  }

  return {
    rawRecord,
    hash,
    company,
    principalAddress,
    mailingAddress,
    people
  };
}
