// cordata/CordataFieldMap.js

/**
 * Florida DOS Fixed-Width Record Map (1,440 Bytes Total)
 * Defines character offset slices (0-indexed, start to end)
 */
export const CORDATA_FIELD_MAP = {
  documentNumber: { start: 0, end: 12 },       // Doc / Corp Number
  legalName:      { start: 12, end: 192 },     // Company Legal Name
  status:         { start: 192, end: 204 },    // Entity Status (e.g. ACT/INACT)
  entityType:     { start: 204, end: 216 },    // Entity Type (LLC, CORP, etc.)
  filingDate:     { start: 216, end: 226 },    // Filing Date (YYYYMMDD)
  state:          { start: 226, end: 228 },    // State (FL)
  
  // Principal Address
  principal: {
    address1: { start: 228, end: 288 },
    address2: { start: 288, end: 348 },
    city:     { start: 348, end: 388 },
    state:    { start: 388, end: 390 },
    zip:      { start: 390, end: 400 }
  },

  // Registered Agent & Officers/People
  registeredAgent: {
    name:     { start: 400, end: 480 },
    address1: { start: 480, end: 540 },
    city:     { start: 540, end: 580 },
    state:    { start: 580, end: 582 },
    zip:      { start: 582, end: 592 }
  },

  // Primary Officer / Officer 1
  officer1: {
    role:     { start: 592, end: 604 },
    name:     { start: 604, end: 684 },
    address1: { start: 684, end: 744 },
    city:     { start: 744, end: 784 },
    state:    { start: 784, end: 786 },
    zip:      { start: 786, end: 796 }
  }
};
