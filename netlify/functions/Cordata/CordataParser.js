// cordata/CordataParser.js
import { CORDATA_FIELD_MAP } from './CordataFieldMap.js';

export class CordataParser {
  /**
   * Safely slices and trims a string segment
   */
  static sliceField(rawLine, start, end) {
    if (!rawLine || rawLine.length < start) return '';
    return rawLine.slice(start, end).trim();
  }

  /**
   * Parses a single 1,440-byte raw line into structured JSON
   */
  static parseRecord(rawLine) {
    if (!rawLine || rawLine.length < 200) {
      throw new Error(`Invalid record length: ${rawLine?.length || 0} bytes (expected ~1440)`);
    }

    const docNum = this.sliceField(rawLine, CORDATA_FIELD_MAP.documentNumber.start, CORDATA_FIELD_MAP.documentNumber.end);
    const legalName = this.sliceField(rawLine, CORDATA_FIELD_MAP.legalName.start, CORDATA_FIELD_MAP.legalName.end);
    const status = this.sliceField(rawLine, CORDATA_FIELD_MAP.status.start, CORDATA_FIELD_MAP.status.end);
    const entityType = this.sliceField(rawLine, CORDATA_FIELD_MAP.entityType.start, CORDATA_FIELD_MAP.entityType.end);
    const filingDate = this.sliceField(rawLine, CORDATA_FIELD_MAP.filingDate.start, CORDATA_FIELD_MAP.filingDate.end);

    // Principal Address
    const principalAddress = {
      street: [
        this.sliceField(rawLine, CORDATA_FIELD_MAP.principal.address1.start, CORDATA_FIELD_MAP.principal.address1.end),
        this.sliceField(rawLine, CORDATA_FIELD_MAP.principal.address2.start, CORDATA_FIELD_MAP.principal.address2.end)
      ].filter(Boolean).join(', '),
      city: this.sliceField(rawLine, CORDATA_FIELD_MAP.principal.city.start, CORDATA_FIELD_MAP.principal.city.end),
      state: this.sliceField(rawLine, CORDATA_FIELD_MAP.principal.state.start, CORDATA_FIELD_MAP.principal.state.end) || 'FL',
      zip: this.sliceField(rawLine, CORDATA_FIELD_MAP.principal.zip.start, CORDATA_FIELD_MAP.principal.zip.end)
    };

    // Associated People / Registered Agent & Officers
    const associatedPeople = [];

    const agentName = this.sliceField(rawLine, CORDATA_FIELD_MAP.registeredAgent.name.start, CORDATA_FIELD_MAP.registeredAgent.name.end);
    if (agentName) {
      associatedPeople.push({
        role: 'REGISTERED AGENT',
        name: agentName,
        address: this.sliceField(rawLine, CORDATA_FIELD_MAP.registeredAgent.address1.start, CORDATA_FIELD_MAP.registeredAgent.address1.end),
        city: this.sliceField(rawLine, CORDATA_FIELD_MAP.registeredAgent.city.start, CORDATA_FIELD_MAP.registeredAgent.city.end),
        state: this.sliceField(rawLine, CORDATA_FIELD_MAP.registeredAgent.state.start, CORDATA_FIELD_MAP.registeredAgent.state.end),
        zip: this.sliceField(rawLine, CORDATA_FIELD_MAP.registeredAgent.zip.start, CORDATA_FIELD_MAP.registeredAgent.zip.end)
      });
    }

    const officer1Name = this.sliceField(rawLine, CORDATA_FIELD_MAP.officer1.name.start, CORDATA_FIELD_MAP.officer1.name.end);
    if (officer1Name) {
      associatedPeople.push({
        role: this.sliceField(rawLine, CORDATA_FIELD_MAP.officer1.role.start, CORDATA_FIELD_MAP.officer1.role.end) || 'OFFICER',
        name: officer1Name,
        address: this.sliceField(rawLine, CORDATA_FIELD_MAP.officer1.address1.start, CORDATA_FIELD_MAP.officer1.address1.end),
        city: this.sliceField(rawLine, CORDATA_FIELD_MAP.officer1.city.start, CORDATA_FIELD_MAP.officer1.city.end),
        state: this.sliceField(rawLine, CORDATA_FIELD_MAP.officer1.state.start, CORDATA_FIELD_MAP.officer1.state.end),
        zip: this.sliceField(rawLine, CORDATA_FIELD_MAP.officer1.zip.start, CORDATA_FIELD_MAP.officer1.zip.end)
      });
    }

    return {
      registrationId: docNum,
      legalName,
      status,
      entityType,
      filingDate,
      state: 'FL',
      principalAddress,
      associatedPeople
    };
  }
}
