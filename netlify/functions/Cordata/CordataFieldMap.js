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

  // Officer 1
  officer1: {
    role:      { start: 571, end: 575 },        // e.g. AMBR, P, VP, MGR
    lastName:  { start: 575, end: 593 },
    firstName: { start: 593, end: 603 },
    middle:    { start: 603, end: 604 },
    address1:  { start: 604, end: 644 },
    city:      { start: 644, end: 672 },
    state:     { start: 672, end: 674 },
    zip:       { start: 674, end: 684 }
  },

  // Officer 2
  officer2: {
    role:      { start: 684, end: 688 },
    lastName:  { start: 688, end: 706 },
    firstName: { start: 706, end: 716 },
    middle:    { start: 716, end: 717 },
    address1:  { start: 717, end: 757 },
    city:      { start: 757, end: 785 },
    state:     { start: 785, end: 787 },
    zip:       { start: 787, end: 797 }
  },

  // Officer 3
  officer3: {
    role:      { start: 797, end: 801 },
    lastName:  { start: 801, end: 819 },
    firstName: { start: 819, end: 829 },
    middle:    { start: 829, end: 830 },
    address1:  { start: 830, end: 870 },
    city:      { start: 870, end: 898 },
    state:     { start: 898, end: 900 },
    zip:       { start: 900, end: 910 }
  },

  // Officer 4
  officer4: {
    role:      { start: 910, end: 914 },
    lastName:  { start: 914, end: 932 },
    firstName: { start: 932, end: 942 },
    middle:    { start: 942, end: 943 },
    address1:  { start: 943, end: 983 },
    city:      { start: 983, end: 1011 },
    state:     { start: 1011, end: 1013 },
    zip:       { start: 1013, end: 1023 }
  },

  // Officer 5
  officer5: {
    role:      { start: 1023, end: 1027 },
    lastName:  { start: 1027, end: 1045 },
    firstName: { start: 1045, end: 1055 },
    middle:    { start: 1055, end: 1056 },
    address1:  { start: 1056, end: 1096 },
    city:      { start: 1096, end: 1124 },
    state:     { start: 1124, end: 1126 },
    zip:       { start: 1126, end: 1136 }
  },

  // Officer 6
  officer6: {
    role:      { start: 1136, end: 1140 },
    lastName:  { start: 1140, end: 1158 },
    firstName: { start: 1158, end: 1168 },
    middle:    { start: 1168, end: 1169 },
    address1:  { start: 1169, end: 1209 },
    city:      { start: 1209, end: 1237 },
    state:     { start: 1237, end: 1239 },
    zip:       { start: 1239, end: 1249 }
  }
};
