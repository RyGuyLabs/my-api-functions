// cordata/CordataFieldMap.js

/**
 * Florida DOS Sunbiz Fixed-Width Record Map (1,440 Bytes Total)
 * Defines exact 0-indexed character offsets (start, end)
 */
export const CORDATA_FIELD_MAP = {
  documentNumber: { start: 0, end: 12 },        // Doc / Corp Number (e.g. L26000432480)
  legalName:      { start: 12, end: 204 },      // Company Legal Name
  status:         { start: 204, end: 205 },     // Entity Status (A = Active, I = Inactive)
  entityType:     { start: 205, end: 210 },     // Entity Type (e.g. FLAL)
  filingDate:     { start: 394, end: 402 },     // Filing Date (MMDDYYYY)
  effectiveDate:  { start: 402, end: 410 },     // Effective Date (MMDDYYYY)
  feiNumber:      { start: 410, end: 424 },     // FEI/EIN Number
  state:          { start: 424, end: 426 },     // State of Origin (e.g. FL)

  // Principal Address
  principal: {
    address1: { start: 210, end: 262 },
    city:     { start: 262, end: 290 },
    state:    { start: 290, end: 292 },
    zip:      { start: 292, end: 302 }
  },

  // Mailing Address
  mailing: {
    address1: { start: 302, end: 354 },
    city:     { start: 354, end: 382 },
    state:    { start: 382, end: 384 },
    zip:      { start: 384, end: 394 }
  },

  // Registered Agent
  registeredAgent: {
    lastName:  { start: 458, end: 476 },
    firstName: { start: 476, end: 486 },
    middle:    { start: 486, end: 487 },
    type:      { start: 487, end: 488 },        // P = Person, C = Corp
    address1:  { start: 488, end: 528 },
    city:      { start: 528, end: 556 },
    state:     { start: 556, end: 558 },
    zip:       { start: 558, end: 568 }
  },

  // Primary Officer / Officer 1
  officer1: {
    role:      { start: 571, end: 575 },        // e.g. AMBR, P, VP, MGR
    lastName:  { start: 575, end: 593 },
    firstName: { start: 593, end: 603 },
    middle:    { start: 603, end: 604 },
    address1:  { start: 604, end: 644 },
    city:      { start: 644, end: 672 },
    state:     { start: 672, end: 674 },
    zip:       { start: 674, end: 684 }
  }
};
