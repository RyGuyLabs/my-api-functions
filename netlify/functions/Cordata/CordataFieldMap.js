/**
 * Florida DOS Cordata/Sunbiz Canonical Offset Map (1,440 Bytes Fixed-Width)
 */
export const CORDATA_FIELD_MAP = {
  RECORD_LENGTH: 1440,

  // Corporate Header (Offsets 0 - 535)
  header: {
    documentNumber: { start: 0, end: 12 },
    legalName:      { start: 12, end: 204 },
    status:         { start: 204, end: 205 },
    entityType:     { start: 205, end: 210 },
    filingDate:     { start: 394, end: 402 },
    effectiveDate:  { start: 402, end: 410 },
    feiNumber:      { start: 410, end: 424 },
    state:          { start: 424, end: 426 }
  },

  // Principal Address
  principalAddress: {
    address1: { start: 210, end: 262 },
    city:     { start: 262, end: 290 },
    state:    { start: 290, end: 292 },
    zip:      { start: 292, end: 302 }
  },

  // Mailing Address
  mailingAddress: {
    address1: { start: 302, end: 354 },
    city:     { start: 354, end: 382 },
    state:    { start: 382, end: 384 },
    zip:      { start: 384, end: 394 }
  },

  // Primary Person / Slot 1 (Offsets 536 - 667)
  slot1: {
    code:          { start: 536, end: 540 },
    year:          { start: 540, end: 544 },
    lastNameOrg:   { start: 544, end: 564 },
    firstName:     { start: 564, end: 578 },
    middleInitial: { start: 578, end: 579 },
    addressPrefix: { start: 580, end: 586 },
    streetAddress: { start: 586, end: 620 },
    city:          { start: 620, end: 640 },
    stateZipChunk: { start: 640, end: 668 }
  },

  // Repeating Relationship Slots (Slots 2 to 7, Offset 668+, Stride 128)
  repeatingSlots: {
    startOffset: 668,
    stride: 128,
    count: 6,
    subFields: {
      roleAndName:   { start: 0, end: 24 },
      firstNameCont: { start: 24, end: 40 },
      addressNum:    { start: 40, end: 48 },
      streetAddress: { start: 48, end: 88 },
      city:          { start: 88, end: 104 },
      padding:       { start: 104, end: 112 },
      stateZipChunk: { start: 112, end: 128 }
    }
  }
};
