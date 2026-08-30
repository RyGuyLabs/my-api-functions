/**
 * netlify/functions/database/PostgresFloridaRegistryDatabase.js
 *
 * PostgreSQL implementation of FloridaRegistryDatabase matching SQLite runtime parity.
 */

let pgModule = null;
function getPg() {
  if (!pgModule) {
    try {
      pgModule = require('pg');
    } catch (err) {
      throw new Error(
        'pg module is not installed. Please install "pg" to use PostgresFloridaRegistryDatabase.'
      );
    }
  }
  return pgModule;
}

class PostgresFloridaRegistryDatabase {
  constructor(options = {}) {
    this.connectionString =
      options.connectionString || process.env.DATABASE_URL || null;

    this.sslOptions = options.ssl;

    if (options.pool) {
      this.pool = options.pool;
      this.ownsPool = false;
    } else if (this.connectionString) {
      const { Pool } = getPg();
      const poolConfig = {
        connectionString: this.connectionString
      };
      if (this.sslOptions !== undefined) {
        poolConfig.ssl = this.sslOptions;
      }
      this.pool = new Pool(poolConfig);
      this.ownsPool = true;
    } else {
      this.pool = null;
      this.ownsPool = false;
    }
  }

  async getPool() {
    if (!this.pool) {
      if (!this.connectionString) {
        throw new Error(
          'PostgresFloridaRegistryDatabase: No pool provided and process.env.DATABASE_URL is not set.'
        );
      }
      const { Pool } = getPg();
      const poolConfig = {
        connectionString: this.connectionString
      };
      if (this.sslOptions !== undefined) {
        poolConfig.ssl = this.sslOptions;
      }
      this.pool = new Pool(poolConfig);
      this.ownsPool = true;
    }
    return this.pool;
  }

  async initializeSchema() {
    const pool = await this.getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(`
        CREATE TABLE IF NOT EXISTS florida_entities (
          registration_id TEXT PRIMARY KEY,
          company_name TEXT NOT NULL,
          entity_type TEXT,
          status TEXT,
          filing_date TEXT,
          principal_address_line1 TEXT,
          principal_address_line2 TEXT,
          principal_city TEXT,
          principal_state TEXT,
          principal_zip TEXT,
          mailing_address_line1 TEXT,
          mailing_address_line2 TEXT,
          mailing_city TEXT,
          mailing_state TEXT,
          mailing_zip TEXT,
          registered_agent_name TEXT,
          source_file TEXT,
          source_type TEXT DEFAULT 'official_state_dataset',
          source_retrieved_at TEXT,
          record_updated_at TEXT,
          classification_code TEXT,
          fei_number TEXT,
          fei_status_raw TEXT,
          jurisdiction_code TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS florida_raw_records (
          registration_id TEXT PRIMARY KEY REFERENCES florida_entities(registration_id) ON DELETE CASCADE,
          raw_line BYTEA,
          source_file TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      await client.query(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'florida_raw_records'
              AND column_name = 'raw_line'
              AND data_type = 'text'
          ) THEN
            ALTER TABLE florida_raw_records
              ALTER COLUMN raw_line TYPE BYTEA
              USING convert_to(raw_line, 'UTF8');
          END IF;
        END
        $$;
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS florida_people (
          id SERIAL PRIMARY KEY,
          registration_id TEXT NOT NULL REFERENCES florida_entities(registration_id) ON DELETE CASCADE,
          person_title TEXT,
          name TEXT,
          address_line1 TEXT,
          address_line2 TEXT,
          city TEXT,
          state TEXT,
          zip TEXT,
          source_file TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS ingestion_manifests (
          id SERIAL PRIMARY KEY,
          source TEXT,
          acquisition_type TEXT,
          source_file TEXT,
          source_file_sha256 TEXT,
          file_size_bytes BIGINT,
          retrieved_at TEXT,
          lines_read INTEGER,
          valid_records INTEGER,
          rejected_records INTEGER,
          records_ingested INTEGER,
          execution_time_seconds DOUBLE PRECISION,
          status TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      // florida_entities indexes
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_fl_entities_name ON florida_entities (LOWER(company_name));
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_fl_entities_status ON florida_entities (status);
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_fl_entities_principal_city ON florida_entities (LOWER(principal_city));
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_fl_entities_principal_state ON florida_entities (principal_state);
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_fl_entities_principal_zip ON florida_entities (principal_zip);
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_fl_entities_mailing_city ON florida_entities (LOWER(mailing_city));
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_fl_entities_mailing_state ON florida_entities (mailing_state);
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_fl_entities_mailing_zip ON florida_entities (mailing_zip);
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_fl_entities_classification_code ON florida_entities (classification_code);
      `);

      // florida_people indexes
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_fl_people_reg_id ON florida_people (registration_id);
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_fl_people_name ON florida_people (LOWER(name));
      `);

      // ingestion_manifests indexes
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_manifests_source_file ON ingestion_manifests (source_file);
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_manifests_retrieved_at ON ingestion_manifests (retrieved_at);
      `);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async close() {
    if (this.ownsPool && this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  /**
   * Transforms parsed domain object to flat SQL record
   */
  toDatabaseRecord(parsed) {
    if (!parsed) return null;

    let registeredAgentName = null;
    if (typeof parsed.registeredAgent === 'string') {
      registeredAgentName = parsed.registeredAgent;
    } else if (parsed.registeredAgent && typeof parsed.registeredAgent === 'object') {
      registeredAgentName = parsed.registeredAgent.name || null;
    }

    const filingDateValue = parsed.formationDate || parsed.filingDate || null;

    return {
      registration_id: parsed.registrationId || null,
      company_name: parsed.companyName || null,
      entity_type: parsed.entityType || null,
      status: parsed.status || null,
      filing_date: filingDateValue,

      principal_address_line1: parsed.principalAddress?.line1 || null,
      principal_address_line2: parsed.principalAddress?.line2 || null,
      principal_city: parsed.principalAddress?.city || null,
      principal_state: parsed.principalAddress?.state || null,
      principal_zip: parsed.principalAddress?.zip || null,

      mailing_address_line1: parsed.mailingAddress?.line1 || null,
      mailing_address_line2: parsed.mailingAddress?.line2 || null,
      mailing_city: parsed.mailingAddress?.city || null,
      mailing_state: parsed.mailingAddress?.state || null,
      mailing_zip: parsed.mailingAddress?.zip || null,

      registered_agent_name: registeredAgentName,

      source_file: parsed.source?.file || null,
      source_type: parsed.source?.sourceType || null,
      source_retrieved_at: parsed.source?.retrievedAt || null,
      record_updated_at: parsed.source?.recordUpdatedAt || null,

      classification_code: parsed.classificationCode || null,
      fei_number: parsed.feiNumber || null,
      fei_status_raw: parsed.feiStatusRaw || null,
      jurisdiction_code: parsed.jurisdictionCode || null
    };
  }

  /**
   * Normalizes DB entity row to standard search result object
   */
  normalizeRecord(row) {
    if (!row) return null;

    return {
      registrationId: row.registration_id,
      companyName: row.company_name,
      entityType: row.entity_type || null,
      status: row.status || 'UNKNOWN',
      formationDate: row.filing_date || null,

      principalAddress: {
        line1: row.principal_address_line1 || null,
        line2: row.principal_address_line2 || null,
        city: row.principal_city || null,
        state: row.principal_state || null,
        zip: row.principal_zip || null
      },

      mailingAddress: {
        line1: row.mailing_address_line1 || null,
        line2: row.mailing_address_line2 || null,
        city: row.mailing_city || null,
        state: row.mailing_state || null,
        zip: row.mailing_zip || null
      },

      registeredAgent: row.registered_agent_name || null,

      source: {
        file: row.source_file || null,
        sourceType: row.source_type || 'official_state_dataset',
        retrievedAt: row.source_retrieved_at || null,
        recordUpdatedAt: row.record_updated_at || null
      }
    };
  }

  async upsertRecord(record) {
    const dbRecord = this.toDatabaseRecord(record);
    if (!dbRecord || !dbRecord.registration_id || !dbRecord.company_name) {
      throw new Error('Record missing required registrationId or companyName.');
    }

    const pool = await this.getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await this._upsertEntity(client, dbRecord);
      await client.query('COMMIT');
      return 1;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async upsertBatch(records) {
    if (!Array.isArray(records)) {
      throw new Error('upsertBatch requires an array of records.');
    }
    if (records.length === 0) {
      return 0;
    }

    const pool = await this.getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      let count = 0;
      for (const rec of records) {
        const dbRecord = this.toDatabaseRecord(rec);
        if (!dbRecord || !dbRecord.registration_id || !dbRecord.company_name) {
          throw new Error('Record missing required registrationId or companyName.');
        }
        await this._upsertEntity(client, dbRecord);
        count++;
      }
      await client.query('COMMIT');
      return count;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async upsertFullRecordBatch(bundleRecords) {
    if (!Array.isArray(bundleRecords)) {
      throw new Error('upsertFullRecordBatch requires an array of bundle records.');
    }
    if (bundleRecords.length === 0) {
      return 0;
    }

    const pool = await this.getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      let count = 0;

      for (const bundle of bundleRecords) {
        const parsed = bundle.parsed;
        const raw = bundle.raw;
        const people = bundle.people || (parsed && parsed.officers) || [];

        const dbRecord = this.toDatabaseRecord(parsed);
        if (!dbRecord || !dbRecord.registration_id || !dbRecord.company_name) {
          throw new Error('Record missing required registrationId or companyName.');
        }

        // 1. Upsert Entity
        await this._upsertEntity(client, dbRecord);

        // 2. Upsert Raw Record if present
        if (raw) {
          const rawLineValue =
            Buffer.isBuffer(raw)
              ? raw
              : typeof raw === 'string'
                ? raw
                : raw.raw_line || raw.rawLine || null;

          const rawLine =
            rawLineValue == null
              ? null
              : Buffer.isBuffer(rawLineValue)
                ? rawLineValue
                : Buffer.from(String(rawLineValue), 'utf8');
          const rawSourceFile = (typeof raw === 'object' && raw.source_file) || dbRecord.source_file;

          await client.query(
            `
            INSERT INTO florida_raw_records (
              registration_id, raw_line, source_file, updated_at
            ) VALUES ($1, $2, $3, NOW())
            ON CONFLICT (registration_id) DO UPDATE SET
              raw_line = EXCLUDED.raw_line,
              source_file = EXCLUDED.source_file,
              updated_at = NOW();
            `,
            [dbRecord.registration_id, rawLine, rawSourceFile]
          );
        }

        // 3. Delete existing people
        await client.query(
          'DELETE FROM florida_people WHERE registration_id = $1',
          [dbRecord.registration_id]
        );

        // 4. Insert current people
        if (Array.isArray(people) && people.length > 0) {
          const personInsertSql = `
            INSERT INTO florida_people (
              registration_id, person_title, name, address_line1, address_line2, city, state, zip, source_file, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW());
          `;

          for (const p of people) {
            const pTitle = p.person_title || p.title || null;
            const pName = typeof p === 'string' ? p : p.name || p.person_name || null;
            const addr = p.address || {};
            const pLine1 = addr.line1 || addr.address1 || p.address_line1 || null;
            const pLine2 = addr.line2 || addr.address2 || p.address_line2 || null;
            const pCity = addr.city || p.city || null;
            const pState = addr.state || p.state || null;
            const pZip = addr.zip || p.zip || null;
            const pSourceFile = p.source_file || dbRecord.source_file || null;

            await client.query(personInsertSql, [
              dbRecord.registration_id,
              pTitle,
              pName,
              pLine1,
              pLine2,
              pCity,
              pState,
              pZip,
              pSourceFile
            ]);
          }
        }

        count++;
      }

      await client.query('COMMIT');
      return count;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async _upsertEntity(client, dbRecord) {
    const upsertSql = `
      INSERT INTO florida_entities (
        registration_id, company_name, entity_type, status, filing_date,
        principal_address_line1, principal_address_line2, principal_city, principal_state, principal_zip,
        mailing_address_line1, mailing_address_line2, mailing_city, mailing_state, mailing_zip,
        registered_agent_name, source_file, source_type, source_retrieved_at, record_updated_at,
        classification_code, fei_number, fei_status_raw, jurisdiction_code, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15,
        $16, $17, COALESCE($18, 'official_state_dataset'), $19, $20,
        $21, $22, $23, $24, NOW()
      )
      ON CONFLICT (registration_id) DO UPDATE SET
        company_name = EXCLUDED.company_name,
        entity_type = EXCLUDED.entity_type,
        status = EXCLUDED.status,
        filing_date = EXCLUDED.filing_date,
        principal_address_line1 = EXCLUDED.principal_address_line1,
        principal_address_line2 = EXCLUDED.principal_address_line2,
        principal_city = EXCLUDED.principal_city,
        principal_state = EXCLUDED.principal_state,
        principal_zip = EXCLUDED.principal_zip,
        mailing_address_line1 = EXCLUDED.mailing_address_line1,
        mailing_address_line2 = EXCLUDED.mailing_address_line2,
        mailing_city = EXCLUDED.mailing_city,
        mailing_state = EXCLUDED.mailing_state,
        mailing_zip = EXCLUDED.mailing_zip,
        registered_agent_name = EXCLUDED.registered_agent_name,
        source_file = EXCLUDED.source_file,
        source_type = COALESCE(EXCLUDED.source_type, florida_entities.source_type, 'official_state_dataset'),
        source_retrieved_at = EXCLUDED.source_retrieved_at,
        record_updated_at = EXCLUDED.record_updated_at,
        classification_code = EXCLUDED.classification_code,
        fei_number = EXCLUDED.fei_number,
        fei_status_raw = EXCLUDED.fei_status_raw,
        jurisdiction_code = EXCLUDED.jurisdiction_code,
        updated_at = NOW();
    `;

    const values = [
      dbRecord.registration_id,
      dbRecord.company_name,
      dbRecord.entity_type,
      dbRecord.status,
      dbRecord.filing_date,
      dbRecord.principal_address_line1,
      dbRecord.principal_address_line2,
      dbRecord.principal_city,
      dbRecord.principal_state,
      dbRecord.principal_zip,
      dbRecord.mailing_address_line1,
      dbRecord.mailing_address_line2,
      dbRecord.mailing_city,
      dbRecord.mailing_state,
      dbRecord.mailing_zip,
      dbRecord.registered_agent_name,
      dbRecord.source_file,
      dbRecord.source_type,
      dbRecord.source_retrieved_at,
      dbRecord.record_updated_at,
      dbRecord.classification_code,
      dbRecord.fei_number,
      dbRecord.fei_status_raw,
      dbRecord.jurisdiction_code
    ];

    await client.query(upsertSql, values);
  }

  async search(searchIntent = {}) {
    const geography = searchIntent.geography || {};

    // State validation parity: must normalize to FL
    const state = String(geography.state || '').trim().toUpperCase();
    if (state !== 'FL') {
      return [];
    }

    const pool = await this.getPool();
    const conditions = [];
    const params = [];
    let paramIdx = 1;

    // State condition matches principal_state OR mailing_state
    conditions.push(
      `(UPPER(principal_state) = 'FL' OR UPPER(mailing_state) = 'FL')`
    );

    // City parity: matches principal_city OR mailing_city (trimmed & case-insensitive)
    if (geography.city) {
      const cityClean = String(geography.city).trim();
      if (cityClean) {
        conditions.push(
          `(TRIM(LOWER(principal_city)) = LOWER($${paramIdx}) OR TRIM(LOWER(mailing_city)) = LOWER($${paramIdx}))`
        );
        params.push(cityClean);
        paramIdx++;
      }
    }

    // ZIP parity: matches first 5 characters of principal_zip OR mailing_zip
    if (geography.zip) {
      const rawZip = String(geography.zip).trim();
      const match = rawZip.match(/\d{5}/);
      const zipClean = match ? match[0] : rawZip;
      if (zipClean) {
        conditions.push(
          `(SUBSTRING(TRIM(principal_zip) FROM 1 FOR 5) = $${paramIdx} OR SUBSTRING(TRIM(mailing_zip) FROM 1 FOR 5) = $${paramIdx})`
        );
        params.push(zipClean);
        paramIdx++;
      }
    }

    // Industry Search Term Normalization parity:
    // stringify -> trim -> lowercase -> remove blanks -> deduplicate -> max 10 -> company_name only
    const industry = searchIntent.industry || {};
    const rawTerms = [];
    if (industry.canonical) rawTerms.push(industry.canonical);
    if (Array.isArray(industry.keywords)) rawTerms.push(...industry.keywords);

    const termSet = new Set();
    for (const term of rawTerms) {
      const normalized = String(term || '').trim().toLowerCase();
      if (normalized.length > 0) {
        termSet.add(normalized);
      }
    }

    const searchTerms = Array.from(termSet).slice(0, 10);

    if (searchTerms.length > 0) {
      const termConditions = [];
      for (const term of searchTerms) {
        termConditions.push(`LOWER(company_name) LIKE $${paramIdx}`);
        params.push(`%${term}%`);
        paramIdx++;
      }
      conditions.push(`(${termConditions.join(' OR ')})`);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    // Limit parsing parity matching SQLite behavior exactly
    let limit = parseInt(searchIntent.limit, 10);
    if (isNaN(limit) || limit < 1) {
      limit = 10;
    } else if (limit > 50) {
      limit = 50;
    }

    const querySql = `
      SELECT * FROM florida_entities
      ${whereClause}
      ORDER BY company_name ASC
      LIMIT $${paramIdx};
    `;
    params.push(limit);

    const res = await pool.query(querySql, params);
    return res.rows.map((row) => this.normalizeRecord(row));
  }

  async recordIngestionManifest(manifest) {
    if (!manifest) return null;
    const pool = await this.getPool();

    const sql = `
      INSERT INTO ingestion_manifests (
        source, acquisition_type, source_file, source_file_sha256, file_size_bytes,
        retrieved_at, lines_read, valid_records, rejected_records, records_ingested,
        execution_time_seconds, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id;
    `;

    const values = [
      manifest.source || null,
      manifest.acquisitionType || null,
      manifest.sourceFile || null,
      manifest.sourceFileSha256 || null,
      manifest.fileSizeBytes || null,
      manifest.retrievedAt || null,
      manifest.linesRead || 0,
      manifest.validRecords || 0,
      manifest.rejectedRecords || 0,
      manifest.recordsIngested || 0,
      manifest.executionTimeSeconds || 0.0,
      manifest.status || null
    ];

    const res = await pool.query(sql, values);
    return res.rows[0]?.id || null;
  }
}

module.exports = {
  PostgresFloridaRegistryDatabase
};
