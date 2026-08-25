/**
 * CordataProvider.js
 * Adapter layer converting parsed Sunbiz/Cordata raw records
 * into standardized Lead Pipeline objects.
 */
const {
  parseCordataRecord
} = require("./CordataParser.js");

export class CordataProvider {
  constructor(options = {}) {
    this.providerName = 'Florida_DOS_Cordata';
    this.version = '1.0.0';
    this.options = options;
  }

  /**
   * Transforms a 1,440-character raw string into a normalized Lead Entity.
   * Maintains strict architectural boundaries by storing the full raw text in evidenceLedger.
   */
  processRecord(raw1440Record) {
    // 1. Execute Core Stage 1/2 Parsing
    const parsed = parseCordataRecord(raw1440Record);

    // 2. Extract Primary Officer/Person if present
    const primaryPerson = parsed.people.length > 0 ? parsed.people[0] : null;

    // 3. Construct Normalized Pipeline Payload
    return {
      // System & Evidence Metadata
      provider: this.providerName,
      processedAt: new Date().toISOString(),
      evidenceLedger: {
        rawRecord: parsed.rawRecord,
        schemaVersion: 'DOS_1440_FIXED_WIDTH',
        recordLength: parsed.rawRecord.length
      },

      // Corporate Identity
      entity: {
        documentNumber: parsed.company.documentNumber,
        legalName: parsed.company.legalName,
        status: parsed.company.status,
        entityType: parsed.company.entityType,
        filingDate: parsed.company.filingDate,
        effectiveDate: parsed.company.effectiveDate,
        feiNumber: parsed.company.feiNumber,
        stateOfInc: parsed.company.state
      },

      // Address Entities
      addresses: {
        principal: parsed.principalAddress,
        mailing: parsed.mailingAddress
      },

      // Associated Officers/Persons (Slots 1-7)
      officers: parsed.people.map(person => ({
        slot: person.slot,
        rawIdentifier: person.roleAndNameRaw || person.nameRaw,
        firstName: person.firstName || null,
        lastNameOrOrg: person.nameRaw || null,
        street: person.street,
        city: person.city,
        state: person.state,
        zip: person.zip
      })),

      // Direct Contact Hooks for Downstream Qualification Engine
      primaryContact: primaryPerson ? {
        name: primaryPerson.roleAndNameRaw || primaryPerson.nameRaw,
        street: primaryPerson.street,
        city: primaryPerson.city,
        state: primaryPerson.state,
        zip: primaryPerson.zip
      } : null
    };
  }

  /**
   * Batch processes an array of raw 1,440-character record strings.
   */
  processBatch(rawRecords = []) {
    return rawRecords.map(record => {
      try {
        return { success: true, lead: this.processRecord(record) };
      } catch (err) {
        return { success: false, error: err.message, rawRecord: record };
      }
    });
  }
}

module.exports = {
  CordataProvider
};
