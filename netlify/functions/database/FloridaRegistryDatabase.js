/**
 * FloridaRegistryDatabase
 *
 * Local database abstraction for the official Florida Division
 * of Corporations registry dataset.
 *
 * RESPONSIBILITY:
 * - Store normalized Florida registry observations.
 * - Store raw fixed-width state lines and associated people records.
 * - Query locally ingested registry records.
 * - Bulk-upsert official registry records atomically.
 * - Preserve dataset provenance.
 *
 * DOES NOT:
 * - Fetch Sunbiz interactively.
 * - Scrape websites.
 * - Parse natural-language searches.
 * - Determine industry classification.
 * - Perform enrichment.
 * - Score prospects.
 * - Qualify leads.
 * - Write to the Evidence Ledger.
 *
 * ARCHITECTURE:
 *
 * Florida Official Data
 *         ↓
 * FloridaIngestionService
 *         ↓
 * FloridaRegistryDatabase
 *         ↓
 * OfficialFloridaProvider
 *         ↓
 * RegistryAcquisitionService
 *         ↓
 * SearchIntent
 */

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

class FloridaRegistryDatabase {

  constructor({
    databasePath =
      process.env.FLORIDA_REGISTRY_DB_PATH ||
      path.join(
        process.cwd(),
        "data",
        "florida-registry.db"
      )
  } = {}) {

    this.name =
      "FloridaRegistryDatabase";

    this.databasePath =
      databasePath;

    const databaseDirectory =
      path.dirname(
        this.databasePath
      );

    fs.mkdirSync(
      databaseDirectory,
      {
        recursive: true
      }
    );

    this.db =
      new Database(
        this.databasePath
      );

    this.db.pragma(
      "journal_mode = WAL"
    );

    this.db.pragma(
      "foreign_keys = ON"
    );

    this.initializeSchema();

    this.prepareStatements();
  }

  // ==========================================================================
  // SCHEMA
  // ==========================================================================

  initializeSchema() {

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS florida_entities (

        id INTEGER PRIMARY KEY AUTOINCREMENT,

        registration_id TEXT NOT NULL UNIQUE,

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

        source_type TEXT NOT NULL
          DEFAULT 'official_state_dataset',

        source_retrieved_at TEXT,

        record_updated_at TEXT,

        created_at TEXT NOT NULL,

        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS
        idx_florida_entities_name
      ON florida_entities(company_name);

      CREATE INDEX IF NOT EXISTS
        idx_florida_entities_status
      ON florida_entities(status);

      CREATE INDEX IF NOT EXISTS
        idx_florida_entities_principal_city
      ON florida_entities(principal_city);

      CREATE INDEX IF NOT EXISTS
        idx_florida_entities_principal_state
      ON florida_entities(principal_state);

      CREATE INDEX IF NOT EXISTS
        idx_florida_entities_principal_zip
      ON florida_entities(principal_zip);

      CREATE INDEX IF NOT EXISTS
        idx_florida_entities_mailing_city
      ON florida_entities(mailing_city);

      CREATE INDEX IF NOT EXISTS
        idx_florida_entities_mailing_state
      ON florida_entities(mailing_state);

      CREATE INDEX IF NOT EXISTS
        idx_florida_entities_mailing_zip
      ON florida_entities(mailing_zip);

      CREATE TABLE IF NOT EXISTS florida_raw_records (

        id INTEGER PRIMARY KEY AUTOINCREMENT,

        registration_id TEXT NOT NULL UNIQUE,

        raw_line TEXT NOT NULL,

        source_file TEXT,

        created_at TEXT NOT NULL,

        updated_at TEXT NOT NULL,

        FOREIGN KEY (registration_id)
          REFERENCES florida_entities(registration_id)
          ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS
        idx_florida_raw_records_reg_id
      ON florida_raw_records(registration_id);

      CREATE TABLE IF NOT EXISTS florida_people (

        id INTEGER PRIMARY KEY AUTOINCREMENT,

        registration_id TEXT NOT NULL,

        person_title TEXT,

        name TEXT NOT NULL,

        address_line1 TEXT,

        address_line2 TEXT,

        city TEXT,

        state TEXT,

        zip TEXT,

        source_file TEXT,

        created_at TEXT NOT NULL,

        updated_at TEXT NOT NULL,

        FOREIGN KEY (registration_id)
          REFERENCES florida_entities(registration_id)
          ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS
        idx_florida_people_reg_id
      ON florida_people(registration_id);

      CREATE INDEX IF NOT EXISTS
        idx_florida_people_name
      ON florida_people(name);

      CREATE TABLE IF NOT EXISTS ingestion_manifests (

        id INTEGER PRIMARY KEY AUTOINCREMENT,

        source TEXT NOT NULL,

        acquisition_type TEXT NOT NULL,

        source_file TEXT NOT NULL,

        source_file_sha256 TEXT,

        file_size_bytes INTEGER,

        retrieved_at TEXT NOT NULL,

        lines_read INTEGER NOT NULL DEFAULT 0,

        valid_records INTEGER NOT NULL DEFAULT 0,

        rejected_records INTEGER NOT NULL DEFAULT 0,

        records_ingested INTEGER NOT NULL DEFAULT 0,

        execution_time_seconds REAL,

        status TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS
        idx_ingestion_manifests_source_file
      ON ingestion_manifests(source_file);

      CREATE INDEX IF NOT EXISTS
        idx_ingestion_manifests_retrieved_at
      ON ingestion_manifests(retrieved_at);
    `);
  }

  // ==========================================================================
  // PREPARED STATEMENTS
  // ==========================================================================

  prepareStatements() {

    this.upsertStatement =
      this.db.prepare(`
        INSERT INTO florida_entities (

          registration_id,
          company_name,
          entity_type,
          status,
          filing_date,

          principal_address_line1,
          principal_address_line2,
          principal_city,
          principal_state,
          principal_zip,

          mailing_address_line1,
          mailing_address_line2,
          mailing_city,
          mailing_state,
          mailing_zip,

          registered_agent_name,

          source_file,
          source_type,
          source_retrieved_at,
          record_updated_at,

          created_at,
          updated_at

        )

        VALUES (

          @registrationId,
          @companyName,
          @entityType,
          @status,
          @filingDate,

          @principalAddressLine1,
          @principalAddressLine2,
          @principalCity,
          @principalState,
          @principalZip,

          @mailingAddressLine1,
          @mailingAddressLine2,
          @mailingCity,
          @mailingState,
          @mailingZip,

          @registeredAgentName,

          @sourceFile,
          @sourceType,
          @sourceRetrievedAt,
          @recordUpdatedAt,

          @createdAt,
          @updatedAt

        )

        ON CONFLICT(registration_id)
        DO UPDATE SET

          company_name =
            excluded.company_name,

          entity_type =
            excluded.entity_type,

          status =
            excluded.status,

          filing_date =
            excluded.filing_date,

          principal_address_line1 =
            excluded.principal_address_line1,

          principal_address_line2 =
            excluded.principal_address_line2,

          principal_city =
            excluded.principal_city,

          principal_state =
            excluded.principal_state,

          principal_zip =
            excluded.principal_zip,

          mailing_address_line1 =
            excluded.mailing_address_line1,

          mailing_address_line2 =
            excluded.mailing_address_line2,

          mailing_city =
            excluded.mailing_city,

          mailing_state =
            excluded.mailing_state,

          mailing_zip =
            excluded.mailing_zip,

          registered_agent_name =
            excluded.registered_agent_name,

          source_file =
            excluded.source_file,

          source_type =
            excluded.source_type,

          source_retrieved_at =
            excluded.source_retrieved_at,

          record_updated_at =
            excluded.record_updated_at,

          updated_at =
            excluded.updated_at
      `);

    this.upsertRawRecordStatement =
      this.db.prepare(`
        INSERT INTO florida_raw_records (

          registration_id,
          raw_line,
          source_file,
          created_at,
          updated_at

        )

        VALUES (

          @registrationId,
          @rawLine,
          @sourceFile,
          @createdAt,
          @updatedAt

        )

        ON CONFLICT(registration_id)
        DO UPDATE SET

          raw_line =
            excluded.raw_line,

          source_file =
            excluded.source_file,

          updated_at =
            excluded.updated_at
      `);

    this.deletePeopleByRegIdStatement =
      this.db.prepare(`
        DELETE FROM florida_people
        WHERE registration_id = ?
      `);

    this.insertPersonStatement =
      this.db.prepare(`
        INSERT INTO florida_people (

          registration_id,
          person_title,
          name,
          address_line1,
          address_line2,
          city,
          state,
          zip,
          source_file,
          created_at,
          updated_at

        )

        VALUES (

          @registrationId,
          @personTitle,
          @name,
          @addressLine1,
          @addressLine2,
          @city,
          @state,
          @zip,
          @sourceFile,
          @createdAt,
          @updatedAt

        )
      `);

    this.upsertBatchTransaction =
      this.db.transaction(
        records => {

          let affected = 0;

          for (const record of records) {

            this.upsertStatement.run(
              this.toDatabaseRecord(record)
            );

            affected++;
          }

          return affected;
        }
      );

    this.upsertFullBatchTransaction =
      this.db.transaction(
        bundleRecords => {

          let affected = 0;

          for (const item of bundleRecords) {

            const entityRecord =
              item.parsed || item;

            const rawLine =
              item.raw || null;

            const people =
              Array.isArray(item.people)
                ? item.people
                : [];

            if (
              !entityRecord ||
              !entityRecord.registrationId ||
              !entityRecord.companyName
            ) {

              throw new Error(
                "Full batch record requires valid parsed data with registrationId and companyName."
              );
            }

            const dbEntity =
              this.toDatabaseRecord(entityRecord);

            this.upsertStatement.run(dbEntity);

            if (rawLine) {

              this.upsertRawRecordStatement.run({

                registrationId:
                  dbEntity.registrationId,

                rawLine:
                  String(rawLine),

                sourceFile:
                  dbEntity.sourceFile,

                createdAt:
                  dbEntity.createdAt,

                updatedAt:
                  dbEntity.updatedAt
              });
            }

            this.deletePeopleByRegIdStatement.run(
              dbEntity.registrationId
            );

            for (const person of people) {

              if (person && person.name) {

                this.insertPersonStatement.run({

                  registrationId:
                    dbEntity.registrationId,

                  personTitle:
                    person.title ||
                    person.personTitle ||
                    null,

                  name:
                    person.name,

                  addressLine1:
                    person.address?.line1 ||
                    person.addressLine1 ||
                    null,

                  addressLine2:
                    person.address?.line2 ||
                    person.addressLine2 ||
                    null,

                  city:
                    person.address?.city ||
                    person.city ||
                    null,

                  state:
                    person.address?.state ||
                    person.state ||
                    null,

                  zip:
                    person.address?.zip ||
                    person.zip ||
                    null,

                  sourceFile:
                    dbEntity.sourceFile,

                  createdAt:
                    dbEntity.createdAt,

                  updatedAt:
                    dbEntity.updatedAt
                });
              }
            }

            affected++;
          }

          return affected;
        }
      );

    this.recordManifestStatement =
      this.db.prepare(`
        INSERT INTO ingestion_manifests (

          source,
          acquisition_type,
          source_file,
          source_file_sha256,
          file_size_bytes,
          retrieved_at,
          lines_read,
          valid_records,
          rejected_records,
          records_ingested,
          execution_time_seconds,
          status

        )

        VALUES (

          @source,
          @acquisitionType,
          @sourceFile,
          @sourceFileSha256,
          @fileSizeBytes,
          @retrievedAt,
          @linesRead,
          @validRecords,
          @rejectedRecords,
          @recordsIngested,
          @executionTimeSeconds,
          @status

        )
      `);
  }

  // ==========================================================================
  // SEARCH
  // ==========================================================================

  async search(searchIntent) {

    if (
      !searchIntent ||
      typeof searchIntent !== "object" ||
      Array.isArray(searchIntent)
    ) {

      throw new Error(
        "FloridaRegistryDatabase.search requires a SearchIntent."
      );
    }

    const geography =
      searchIntent.geography || {};

    const industry =
      searchIntent.industry || {};

    const state =
      String(
        geography.state || ""
      )
        .trim()
        .toUpperCase();

    if (
      state !== "FL"
    ) {
      return [];
    }

    const limit =
      Math.min(
        Math.max(
          Number.parseInt(
            searchIntent.limit,
            10
          ) || 10,
          1
        ),
        50
      );

    const conditions = [

      `(
        UPPER(principal_state) = @state
        OR
        UPPER(mailing_state) = @state
      )`

    ];

    const parameters = {
      state
    };

    // ------------------------------------------------------------------------
    // CITY
    // ------------------------------------------------------------------------

    if (
      geography.city
    ) {

      conditions.push(`
        (
          LOWER(TRIM(principal_city)) =
            LOWER(TRIM(@city))

          OR

          LOWER(TRIM(mailing_city)) =
            LOWER(TRIM(@city))
        )
      `);

      parameters.city =
        String(
          geography.city
        ).trim();
    }

    // ------------------------------------------------------------------------
    // ZIP
    // ------------------------------------------------------------------------

    if (
      geography.zip
    ) {

      const normalizedZip =
        String(
          geography.zip
        )
          .trim()
          .split("-")[0];

      conditions.push(`
        (
          SUBSTR(
            TRIM(principal_zip),
            1,
            5
          ) = @zip

          OR

          SUBSTR(
            TRIM(mailing_zip),
            1,
            5
          ) = @zip
        )
      `);

      parameters.zip =
        normalizedZip;
    }

    // ------------------------------------------------------------------------
    // INDUSTRY DISCOVERY
    //
    // IMPORTANT:
    //
    // This is a registry-name search only.
    // It does NOT establish industry classification.
    // ------------------------------------------------------------------------

    const industryTerms = [

      industry.canonical,

      ...(Array.isArray(
        industry.keywords
      )
        ? industry.keywords
        : [])

    ]
      .map(
        value =>
          String(
            value || ""
          )
            .trim()
            .toLowerCase()
      )
      .filter(Boolean);

    const uniqueIndustryTerms =
      [
        ...new Set(
          industryTerms
        )
      ];

    if (
      uniqueIndustryTerms.length > 0
    ) {

      const industryConditions = [];

      uniqueIndustryTerms
        .slice(0, 10)
        .forEach(
          (term, index) => {

            const parameterName =
              `industryTerm${index}`;

            industryConditions.push(
              `
                LOWER(company_name)
                LIKE @${parameterName}
              `
            );

            parameters[
              parameterName
            ] =
              `%${term}%`;
          }
        );

      conditions.push(`
        (
          ${industryConditions.join(
            " OR "
          )}
        )
      `);
    }

    // ------------------------------------------------------------------------
    // QUERY
    // ------------------------------------------------------------------------

    const sql = `

      SELECT

        registration_id,
        company_name,
        entity_type,
        status,
        filing_date,

        principal_address_line1,
        principal_address_line2,
        principal_city,
        principal_state,
        principal_zip,

        mailing_address_line1,
        mailing_address_line2,
        mailing_city,
        mailing_state,
        mailing_zip,

        registered_agent_name,

        source_file,
        source_type,
        source_retrieved_at,
        record_updated_at

      FROM florida_entities

      WHERE
        ${conditions.join(" AND ")}

      ORDER BY
        company_name ASC

      LIMIT @limit

    `;

    parameters.limit =
      limit;

    const rows =
      this.db
        .prepare(sql)
        .all(
          parameters
        );

    return rows.map(
      row =>
        this.normalizeRecord(
          row
        )
    );
  }

  // ==========================================================================
  // NORMALIZATION
  // ==========================================================================

  normalizeRecord(row) {

    return {

      registrationId:
        row.registration_id ||
        null,

      companyName:
        row.company_name ||
        null,

      entityType:
        row.entity_type ||
        null,

      status:
        row.status ||
        "UNKNOWN",

      formationDate:
        row.filing_date ||
        null,

      principalAddress: {

        line1:
          row.principal_address_line1 ||
          null,

        line2:
          row.principal_address_line2 ||
          null,

        city:
          row.principal_city ||
          null,

        state:
          row.principal_state ||
          null,

        zip:
          row.principal_zip ||
          null
      },

      mailingAddress: {

        line1:
          row.mailing_address_line1 ||
          null,

        line2:
          row.mailing_address_line2 ||
          null,

        city:
          row.mailing_city ||
          null,

        state:
          row.mailing_state ||
          null,

        zip:
          row.mailing_zip ||
          null
      },

      registeredAgent:
        row.registered_agent_name ||
        null,

      source: {

        file:
          row.source_file ||
          null,

        sourceType:
          row.source_type ||
          "official_state_dataset",

        retrievedAt:
          row.source_retrieved_at ||
          null,

        recordUpdatedAt:
          row.record_updated_at ||
          null
      }
    };
  }

  // ==========================================================================
  // UPSERT
  // ==========================================================================

  upsertRecord(record) {

    if (
      !record ||
      !record.registrationId ||
      !record.companyName
    ) {

      throw new Error(
        "Florida registry record requires registrationId and companyName."
      );
    }

    this.upsertStatement.run(
      this.toDatabaseRecord(
        record
      )
    );
  }

  // ==========================================================================
  // BULK UPSERT
  // ==========================================================================

  upsertBatch(records) {

    if (
      !Array.isArray(records)
    ) {

      throw new Error(
        "FloridaRegistryDatabase.upsertBatch requires an array."
      );
    }

    if (
      records.length === 0
    ) {
      return 0;
    }

    for (
      const record of records
    ) {

      if (
        !record ||
        !record.registrationId ||
        !record.companyName
      ) {

        throw new Error(
          "Florida registry batch contains a record without registrationId or companyName."
        );
      }
    }

    return this.upsertBatchTransaction(
      records
    );
  }

  /**
   * Atomically stores structured parsed entities, original raw fixed-width lines,
   * and associated people in a single database transaction.
   *
   * @param {Array<Object>} bundleRecords - Array of objects structured as:
   *   {
   *     parsed: Object, // Cordata entity object (required)
   *     raw: String,    // Raw 1,440-character fixed-width record line (optional)
   *     people: Array   // Array of officer/person objects (optional)
   *   }
   * @returns {number} Count of affected bundled records.
   */
  upsertFullRecordBatch(bundleRecords) {

    if (!Array.isArray(bundleRecords)) {

      throw new Error(
        "FloridaRegistryDatabase.upsertFullRecordBatch requires an array."
      );
    }

    if (bundleRecords.length === 0) {
      return 0;
    }

    return this.upsertFullBatchTransaction(
      bundleRecords
    );
  }

  // ==========================================================================
  // DATABASE MAPPING
  // ==========================================================================

  toDatabaseRecord(record) {

    const now =
      new Date().toISOString();

    return {

      registrationId:
        record.registrationId,

      companyName:
        record.companyName,

      entityType:
        record.entityType ||
        null,

      status:
        record.status ||
        null,

      filingDate:
        record.formationDate ||
        null,

      principalAddressLine1:
        record.principalAddress?.line1 ||
        null,

      principalAddressLine2:
        record.principalAddress?.line2 ||
        null,

      principalCity:
        record.principalAddress?.city ||
        null,

      principalState:
        record.principalAddress?.state ||
        "FL",

      principalZip:
        record.principalAddress?.zip ||
        null,

      mailingAddressLine1:
        record.mailingAddress?.line1 ||
        null,

      mailingAddressLine2:
        record.mailingAddress?.line2 ||
        null,

      mailingCity:
        record.mailingAddress?.city ||
        null,

      mailingState:
        record.mailingAddress?.state ||
        "FL",

      mailingZip:
        record.mailingAddress?.zip ||
        null,

      registeredAgentName:
        record.registeredAgent ||
        null,

      sourceFile:
        record.source?.file ||
        null,

      sourceType:
        record.source?.sourceType ||
        "official_state_dataset",

      sourceRetrievedAt:
        record.source?.retrievedAt ||
        now,

      recordUpdatedAt:
        record.source?.recordUpdatedAt ||
        now,

      createdAt:
        now,

      updatedAt:
        now
    };
  }

  // ==========================================================================
  // INGESTION MANIFEST
  // ==========================================================================

  recordIngestionManifest(
    manifest
  ) {

    if (
      !manifest ||
      typeof manifest !== "object"
    ) {

      throw new Error(
        "recordIngestionManifest requires a manifest object."
      );
    }

    this.recordManifestStatement.run({

      source:
        manifest.source ||
        "Florida Division of Corporations",

      acquisitionType:
        manifest.acquisitionType ||
        "unknown",

      sourceFile:
        manifest.sourceFile ||
        "unknown",

      sourceFileSha256:
        manifest.sourceFileSha256 ||
        null,

      fileSizeBytes:
        Number(
          manifest.fileSizeBytes
        ) || null,

      retrievedAt:
        manifest.retrievedAt ||
        new Date().toISOString(),

      linesRead:
        Number(
          manifest.linesRead
        ) || 0,

      validRecords:
        Number(
          manifest.validRecords
        ) || 0,

      rejectedRecords:
        Number(
          manifest.rejectedRecords
        ) || 0,

      recordsIngested:
        Number(
          manifest.recordsIngested
        ) || 0,

      executionTimeSeconds:
        Number(
          manifest.executionTimeSeconds
        ) || 0,

      status:
        manifest.status ||
        "unknown"
    });
  }

  // ==========================================================================
  // CLOSE
  // ==========================================================================

  close() {

    if (
      this.db &&
      this.db.open
    ) {

      this.db.close();
    }
  }
}

module.exports = {
  FloridaRegistryDatabase
};
