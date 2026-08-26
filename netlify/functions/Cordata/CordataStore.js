/**
 * CordataStore.js
 * Database Staging Layer: Prepares SQL statements and JSON document payloads
 * for persisting parsed leads and raw evidence ledgers.
 */

export class CordataStore {
  /**
   * Converts a normalized Cordata lead payload into database insertion objects.
   */
  static prepareInsertPayload(leadPayload) {
    const { entity, addresses, officers, evidenceLedger } = leadPayload;

    return {
      // 1. Immutable Audit Ledger
      ledgerRecord: {
        documentNumber: entity.documentNumber,
        rawRecord: evidenceLedger.rawRecord,
        length: evidenceLedger.recordLength,
        ingestedAt: leadPayload.processedAt
      },

      // 2. Normalized Entity Record
      entityRecord: {
        documentNumber: entity.documentNumber,
        legalName: entity.legalName,
        status: entity.status || null,
        entityType: entity.entityType || null,
        filingDate: entity.filingDate || null,
        effectiveDate: entity.effectiveDate || null,
        feiNumber: entity.feiNumber || null,

        classificationCode: entity.classificationCode || null,
        feiStatusRaw: entity.feiStatusRaw || null,
        jurisdictionCode: entity.jurisdictionCode || null,

        stateOfInc: entity.stateOfInc || null,
        principalAddress: JSON.stringify(addresses.principal),
        mailingAddress: JSON.stringify(addresses.mailing)
      },

      // 3. Officer/Relationship Array
      officerRecords: officers.map(o => ({
        documentNumber: entity.documentNumber,
        slotNumber: o.slot,
        rawIdentifier: o.rawIdentifier,
        firstName: o.firstName,
        lastNameOrOrg: o.lastNameOrOrg,
        streetAddress: o.street,
        city: o.city,
        state: o.state,
        zip: o.zip
      }))
    };
  }

  /**
   * Generates a parameterized SQL query tuple for raw PostgreSQL/MySQL adapters.
   */
  static toSqlStatements(leadPayload) {
    const payload = this.prepareInsertPayload(leadPayload);

    const ledgerSql = `
      INSERT INTO cordata_raw_ledger (
        document_number,
        raw_record_1440
      )
      VALUES ($1, $2);
    `;

    const ledgerParams = [
      payload.ledgerRecord.documentNumber,
      payload.ledgerRecord.rawRecord
    ];

    const entitySql = `
      INSERT INTO cordata_entities (
        document_number,
        legal_name,
        status,
        entity_type,
        filing_date,
        effective_date,
        fei_number,
        classification_code,
        fei_status_raw,
        jurisdiction_code,
        state_of_inc,
        principal_address,
        mailing_address
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13
      )
      ON CONFLICT (document_number) DO UPDATE SET
        legal_name = EXCLUDED.legal_name,
        status = EXCLUDED.status,
        entity_type = EXCLUDED.entity_type,
        filing_date = EXCLUDED.filing_date,
        effective_date = EXCLUDED.effective_date,
        fei_number = EXCLUDED.fei_number,
        classification_code = EXCLUDED.classification_code,
        fei_status_raw = EXCLUDED.fei_status_raw,
        jurisdiction_code = EXCLUDED.jurisdiction_code,
        state_of_inc = EXCLUDED.state_of_inc,
        principal_address = EXCLUDED.principal_address,
        mailing_address = EXCLUDED.mailing_address,
        updated_at = CURRENT_TIMESTAMP;
    `;

    const entityParams = [
      payload.entityRecord.documentNumber,
      payload.entityRecord.legalName,
      payload.entityRecord.status,
      payload.entityRecord.entityType,
      payload.entityRecord.filingDate,
      payload.entityRecord.effectiveDate,
      payload.entityRecord.feiNumber,
      payload.entityRecord.classificationCode,
      payload.entityRecord.feiStatusRaw,
      payload.entityRecord.jurisdictionCode,
      payload.entityRecord.stateOfInc,
      payload.entityRecord.principalAddress,
      payload.entityRecord.mailingAddress
    ];

    return {
      ledger: {
        sql: ledgerSql,
        params: ledgerParams
      },

      entity: {
        sql: entitySql,
        params: entityParams
      },

      officersCount: payload.officerRecords.length
    };
  }
}
