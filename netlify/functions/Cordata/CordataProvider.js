import { parseCordataRecord } from './CordataParser.js';

export class CordataProvider {
  constructor() {
    this.providerName = 'Florida_DOS_Cordata';
    this.version = '1.0.0';
  }

  processRecord(rawRecord) {
    const recordByteLength =
      Buffer.isBuffer(rawRecord)
        ? rawRecord.length
        : Buffer.byteLength(String(rawRecord || ''), 'utf8');

    if (!rawRecord || recordByteLength !== 1440) {
      throw new Error(`Invalid record byte length: ${recordByteLength}. Expected 1440.`);
    }

    const parsed = parseCordataRecord(rawRecord);

    const entity = {
      documentNumber: parsed.company.documentNumber,
      legalName: parsed.company.legalName,
      classificationCode: parsed.company.classificationCode,
      filingDate: parsed.company.filingDate,
      feiNumber: parsed.company.feiNumber || null,
      feiStatusRaw: parsed.company.feiStatusRaw || null,
      jurisdictionCode: parsed.company.jurisdictionCode || null
    };

    const addresses = {
      principal: parsed.principalAddress,
      mailing: parsed.mailingAddress
    };

    const officers = (parsed.people || []).map((person) => ({
      slot: person.slot,
      role: person.role || null,
      entityType: person.entityType || null,
      rawIdentifier: person.roleAndNameRaw || person.nameRaw || null,
      firstName: person.firstName || null,
      lastNameOrOrg: person.lastNameOrg || null,
      nameQualifier: person.nameQualifier || null,
      street: person.street || null,
      city: person.city || null,
      state: person.state || null,
      zip: person.zip || null
    }));

    // Primary contact selection: Prefer first person where slot >= 2, fall back to people[0], or null
    let primaryContact = null;
    if (parsed.people && parsed.people.length > 0) {
      const slot2PlusPerson = parsed.people.find((p) => p.slot >= 2);
      const selectedPerson = slot2PlusPerson || parsed.people[0];

      const name = [selectedPerson.firstName, selectedPerson.lastNameOrg]
        .filter(Boolean)
        .join(' ')
        .trim();

      primaryContact = {
        name: name || null,
        slot: selectedPerson.slot,
        role: selectedPerson.role || null,
        entityType: selectedPerson.entityType || null,
        rawIdentifier: selectedPerson.roleAndNameRaw || selectedPerson.nameRaw || null,
        firstName: selectedPerson.firstName || null,
        lastNameOrOrg: selectedPerson.lastNameOrg || null,
        nameQualifier: selectedPerson.nameQualifier || null,
        street: selectedPerson.street || null,
        city: selectedPerson.city || null,
        state: selectedPerson.state || null,
        zip: selectedPerson.zip || null
      };
    }

    const evidenceLedger = {
      rawRecord: parsed.rawRecord,
      schemaVersion: 'DOS_1440_FIXED_WIDTH',
      recordLength: Buffer.isBuffer(parsed.rawRecord)
        ? parsed.rawRecord.length
        : Buffer.byteLength(parsed.rawRecord, 'utf8')
    };

   return {
  provider: this.providerName,
  providerName: this.providerName,
  version: this.version,
  processedAt: new Date().toISOString(),
  entity,
  addresses,
  officers,
  primaryContact,
  evidenceLedger
};
  }

  processBatch(rawRecords) {
    if (!Array.isArray(rawRecords)) {
      throw new Error('Input must be an array of raw record strings.');
    }

    const results = [];

    for (let i = 0; i < rawRecords.length; i++) {
      const rawRecord = rawRecords[i];
      try {
        const lead = this.processRecord(rawRecord);
        results.push({
          success: true,
          lead,
          recordIndex: i
        });
      } catch (err) {
        results.push({
          success: false,
          error: err.message,
          rawRecord,
          recordIndex: i
        });
      }
    }

    return results;
  }
}
