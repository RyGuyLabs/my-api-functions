import { CORDATA_FIELD_MAP } from './CordataFieldMap.js';

function assertRecordLength(rawRecord, expectedLength = 1440) {
  if (!rawRecord || rawRecord.length !== expectedLength) {
    throw new Error(`Invalid record length: expected ${expectedLength}, got ${rawRecord?.length || 0}`);
  }
}

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

function parseCorporateHeader(rawRecord) {
  const map = CORDATA_FIELD_MAP.header;
  return {
    documentNumber: sliceField(rawRecord, map.documentNumber.start, map.documentNumber.end),
    legalName:      sliceField(rawRecord, map.legalName.start, map.legalName.end),
    status:         sliceField(rawRecord, map.status.start, map.status.end),
    entityType:     sliceField(rawRecord, map.entityType.start, map.entityType.end),
    filingDate:     sliceField(rawRecord, map.filingDate.start, map.filingDate.end),
    effectiveDate:  sliceField(rawRecord, map.effectiveDate.start, map.effectiveDate.end),
    feiNumber:      sliceField(rawRecord, map.feiNumber.start, map.feiNumber.end),
    state:          sliceField(rawRecord, map.state.start, map.state.end)
  };
}

function parsePrincipalAddress(rawRecord) {
  const map = CORDATA_FIELD_MAP.principalAddress;
  return {
    street: sliceField(rawRecord, map.address1.start, map.address1.end),
    city:   sliceField(rawRecord, map.city.start, map.city.end),
    state:  sliceField(rawRecord, map.state.start, map.state.end),
    zip:    sliceField(rawRecord, map.zip.start, map.zip.end)
  };
}

function parseMailingAddress(rawRecord) {
  const map = CORDATA_FIELD_MAP.mailingAddress;
  return {
    street: sliceField(rawRecord, map.address1.start, map.address1.end),
    city:   sliceField(rawRecord, map.city.start, map.city.end),
    state:  sliceField(rawRecord, map.state.start, map.state.end),
    zip:    sliceField(rawRecord, map.zip.start, map.zip.end)
  };
}

function parsePersonSlots(rawRecord) {
  const people = [];

  // Slot 1
  const s1 = CORDATA_FIELD_MAP.slot1;
  const s1LastNameOrg = sliceField(rawRecord, s1.lastNameOrg.start, s1.lastNameOrg.end);
  
  if (s1LastNameOrg) {
    const stateZipChunk = rawRecord.slice(s1.stateZipChunk.start, s1.stateZipChunk.end);
    const { state, zip } = parseStateAndZip(stateZipChunk);

    people.push({
      slot: 1,
      role: 'PRIMARY',
      nameRaw: s1LastNameOrg,
      firstName: sliceField(rawRecord, s1.firstName.start, s1.firstName.end) || null,
      middleInitial: sliceField(rawRecord, s1.middleInitial.start, s1.middleInitial.end) || null,
      addressPrefix: sliceField(rawRecord, s1.addressPrefix.start, s1.addressPrefix.end) || null,
      street: sliceField(rawRecord, s1.streetAddress.start, s1.streetAddress.end),
      city: sliceField(rawRecord, s1.city.start, s1.city.end),
      state,
      zip
    });
  }

  // Repeating Slots 2 to 7 (+128 Stride)
  const rep = CORDATA_FIELD_MAP.repeatingSlots;
  for (let i = 0; i < rep.count; i++) {
    const slotStart = rep.startOffset + (i * rep.stride);
    const slotEnd = slotStart + rep.stride;
    const slotChunk = rawRecord.slice(slotStart, slotEnd);

    if (!slotChunk.trim()) continue;

    const roleAndName = slotChunk.slice(rep.subFields.roleAndName.start, rep.subFields.roleAndName.end).trim();
    if (!roleAndName) continue;

    const stateZipChunk = slotChunk.slice(rep.subFields.stateZipChunk.start, rep.subFields.stateZipChunk.end);
    const { state, zip } = parseStateAndZip(stateZipChunk);

    const addressNum = slotChunk.slice(rep.subFields.addressNum.start, rep.subFields.addressNum.end).trim();
    const streetCont = slotChunk.slice(rep.subFields.streetAddress.start, rep.subFields.streetAddress.end).trim();

    people.push({
      slot: i + 2,
      roleAndNameRaw: roleAndName,
      firstNameCont: slotChunk.slice(rep.subFields.firstNameCont.start, rep.subFields.firstNameCont.end).trim() || null,
      street: `${addressNum} ${streetCont}`.trim(),
      city: slotChunk.slice(rep.subFields.city.start, rep.subFields.city.end).trim(),
      state,
      zip
    });
  }

  return people;
}

export function parseCordataRecord(rawRecord) {
  assertRecordLength(rawRecord, 1440);

  return {
    rawRecord, // Preserves untouched string for Evidence Ledger
    company: parseCorporateHeader(rawRecord),
    principalAddress: parsePrincipalAddress(rawRecord),
    mailingAddress: parseMailingAddress(rawRecord),
    people: parsePersonSlots(rawRecord)
  };
}
