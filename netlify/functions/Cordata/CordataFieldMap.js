/**
 * Florida DOS Cordata/Sunbiz Canonical Offset Map (1,440 Bytes Fixed-Width)
 * Precision calibrated against real payload
 */
const CORDATA_FIELD_MAP = {
  RECORD_LENGTH: 1440,

  header: {
    documentNumber: { start: 0, end: 12 },
    legalName:      { start: 12, end: 192 },
    status:         { start: 192, end: 193 },
    entityType:     { start: 193, end: 200 }, // Expands to capture AFLAL/FLAL
    filingDate:     { start: 472, end: 480 }, // Clean MM/DD/YYYY numeric string
    effectiveDate:  { start: 480, end: 488 },
    feiNumber:      { start: 488, end: 502 },
    state:          { start: 500, end: 504 }
  },

  principalAddress: {
    address1: { start: 216, end: 274 },
    city:     { start: 274, end: 326 },
    state:    { start: 326, end: 330 },
    zip:      { start: 330, end: 342 }
  },

  mailingAddress: {
    address1: { start: 342, end: 400 },
    city:     { start: 400, end: 452 },
    state:    { start: 452, end: 456 },
    zip:      { start: 456, end: 468 }  // Starts clean at 456 -> '33144'
  },

  slot1: {
    code:          { start: 536, end: 540 },
    year:          { start: 540, end: 544 },
    lastNameOrg:   { start: 544, end: 564 },
    firstName:     { start: 564, end: 578 },
    middleInitial: { start: 578, end: 580 },
    addressPrefix: { start: 580, end: 588 }, // Absorbs leftover 'P'
    streetAddress: { start: 588, end: 620 }, // Clean street
    city:          { start: 620, end: 640 },
    stateZipChunk: { start: 640, end: 668 }
  },

  repeatingSlots: {
    startOffset: 668,
    stride: 128,
    count: 6,
    subFields: {
      role:          { start: 0, end: 6 },     // Captures 'AMBR'
      lastNameOrg:   { start: 6, end: 24 },    // Captures 'BORGES'
      firstName:     { start: 24, end: 40 },   // Captures 'JOANN M'
      addressNum:    { start: 40, end: 48 },
      streetAddress: { start: 48, end: 88 },
      city:          { start: 88, end: 104 },
      padding:       { start: 104, end: 112 },
      stateZipChunk: { start: 112, end: 128 }
    }
  }
};

module.exports = {
  CORDATA_FIELD_MAP
};
