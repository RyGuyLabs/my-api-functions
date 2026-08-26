/**
 * Florida DOS Cordata/Sunbiz Canonical Offset Map (1,440 Bytes Fixed-Width)
 * Precision calibrated against real payload boundaries.
 */
export const CORDATA_FIELD_MAP = {
  RECORD_LENGTH: 1440,

  header: {
    documentNumber:   { start: 0,   end: 12 },
    legalName:        { start: 12,  end: 204 },
    classificationCode:{ start: 204, end: 209 },
    reservedPadding:  { start: 209, end: 220 },
    filingDate:       { start: 472, end: 480 },
    feiNumber:        { start: 480, end: 494 },
    feiStatusRaw:     { start: 494, end: 503 },
    jurisdictionCode: { start: 503, end: 505 },
    reservedTail:     { start: 505, end: 536 }
  },

  principalAddress: {
    address1: { start: 220, end: 304 },
    city:     { start: 304, end: 332 },
    state:    { start: 332, end: 334 },
    zip:      { start: 334, end: 344 },
    country:  { start: 344, end: 346 }
  },

  mailingAddress: {
    address1: { start: 346, end: 430 },
    city:     { start: 430, end: 458 },
    state:    { start: 458, end: 460 },
    zip:      { start: 460, end: 470 },
    country:  { start: 470, end: 472 }
  },

  slot1: {
    code:          { start: 536, end: 540 },
    year:          { start: 540, end: 544 },
    lastNameOrg:   { start: 544, end: 564 },
    firstName:     { start: 564, end: 578 },
    middleInitial: { start: 578, end: 580 },
    addressPrefix: { start: 580, end: 588 },
    streetAddress: { start: 588, end: 620 },
    city:          { start: 620, end: 640 },
    stateZipChunk: { start: 640, end: 668 }
  },

  repeatingSlots: {
    startOffset: 668,
    stride: 128,
    count: 6,
    subFields: {
      role:          { start: 0,  end: 4 },
      entityType:    { start: 4,  end: 5 },
      lastNameOrg:   { start: 5,  end: 25 },
      firstName:     { start: 25, end: 39 },
      nameQualifier: { start: 39, end: 47 },
      addressNum:    { start: 47, end: 48 },
      streetAddress: { start: 48, end: 88 },
      city:          { start: 88, end: 116 },
      stateZipChunk: { start: 116, end: 128 }
    }
  }
};
