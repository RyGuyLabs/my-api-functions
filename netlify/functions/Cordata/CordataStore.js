export class CordataStore {
  static prepareInsertPayload(leadPayload) {
    if (!leadPayload || !leadPayload.entity || !leadPayload.entity.documentNumber) {
      throw new Error('Invalid lead payload: missing entity documentNumber.');
    }

    const { entity, addresses, officers, evidenceLedger } = leadPayload;

    const ledgerRecord = {
      documentNumber: entity.documentNumber,
      rawRecord: evidenceLedger?.rawRecord || '',
      schemaVersion: evidenceLedger?.schemaVersion || 'DOS_1440_FIXED_WIDTH',
      recordLength: evidenceLedger?.recordLength || 0
    };

    entityRecord: {
  documentNumber: entity.documentNumber,
  legalName: entity.legalName,
  status: entity.status,
  entityType: entity.entityType,
  filingDate: entity.filingDate,
  effectiveDate: entity.effectiveDate,
  feiNumber: entity.feiNumber,
  classificationCode: entity.classificationCode || null,
  feiStatusRaw: entity.feiStatusRaw || null,
  jurisdictionCode: entity.jurisdictionCode || null,
  stateOfInc: entity.stateOfInc,
  principalAddress: JSON.stringify(addresses.principal),
  mailingAddress: JSON.stringify(addresses.mailing)
};

    const officerRecords = (officers || []).map((o) => ({
      documentNumber: entity.documentNumber,
      slotNumber: o.slot,
      rawIdentifier: o.rawIdentifier || null,
      firstName: o.firstName || null,
      lastNameOrOrg: o.lastNameOrOrg || null,
      streetAddress: o.street || null,
      city: o.city || null,
      state: o.state || null,
      zip: o.zip || null
    }));

    return {
      ledgerRecord,
      entityRecord,
      officerRecords
    };
  }

  static toSqlStatements(leadPayload) {
    const payload = this.prepareInsertPayload(leadPayload);
    const { ledgerRecord, entityRecord, officerRecords } = payload;

    const ledgerSql = `
      INSERT INTO cordata_raw_ledger (document_number, raw_record, schema_version)
      VALUES ($1, $2, $3)
      ON CONFLICT (document_number) DO UPDATE SET
        raw_record = EXCLUDED.raw_record,
        schema_version = EXCLUDED.schema_version,
        processed_at = NOW();
    `;
    const ledgerParams = [
      ledgerRecord.documentNumber,
      ledgerRecord.rawRecord,
      ledgerRecord.schemaVersion
    ];

    const entitySql = `
      INSERT INTO cordata_entities (
        document_number, legal_name, status, entity_type, classification_code,
        filing_date, effective_date, fei_number, fei_status_raw, jurisdiction_code,
        state_of_inc, principal_address, mailing_address
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (document_number) DO UPDATE SET
        legal_name = EXCLUDED.legal_name,
        status = EXCLUDED.status,
        entity_type = EXCLUDED.entity_type,
        classification_code = EXCLUDED.classification_code,
        filing_date = EXCLUDED.filing_date,
        effective_date = EXCLUDED.effective_date,
        fei_number = EXCLUDED.fei_number,
        fei_status_raw = EXCLUDED.fei_status_raw,
        jurisdiction_code = EXCLUDED.jurisdiction_code,
        state_of_inc = EXCLUDED.state_of_inc,
        principal_address = EXCLUDED.principal_address,
        mailing_address = EXCLUDED.mailing_address,
        updated_at = NOW();
    `;
    const entityParams = [
      entityRecord.documentNumber,
      entityRecord.legalName,
      entityRecord.status,
      entityRecord.entityType,
      entityRecord.classificationCode,
      entityRecord.filingDate,
      entityRecord.effectiveDate,
      entityRecord.feiNumber,
      entityRecord.feiStatusRaw,
      entityRecord.jurisdictionCode,
      entityRecord.stateOfInc,
      JSON.stringify(entityRecord.principalAddress),
      JSON.stringify(entityRecord.mailingAddress)
    ];

    const officerSqls = officerRecords.map((off) => ({
      text: `
        INSERT INTO cordata_officers (
          document_number, slot_number, raw_identifier, first_name,
          last_name_or_org, street_address, city, state, zip
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
      `,
      params: [
        off.documentNumber,
        off.slotNumber,
        off.rawIdentifier,
        off.firstName,
        off.lastNameOrOrg,
        off.streetAddress,
        off.city,
        off.state,
        off.zip
      ]
    }));

    return {
      ledger: { text: ledgerSql, params: ledgerParams },
      entity: { text: entitySql, params: entityParams },
      officers: officerSqls
    };
  }
}
