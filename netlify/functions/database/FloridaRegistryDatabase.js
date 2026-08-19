/**
 * FloridaRegistryDatabase
 *
 * Local database abstraction for the official Florida Division
 * of Corporations registry dataset.
 *
 * RESPONSIBILITY:
 * - Store normalized Florida registry observations.
 * - Query locally ingested registry records.
 * - Return registry observations matching SearchIntent.
 *
 * DOES NOT:
 * - Fetch Sunbiz interactively.
 * - Scrape websites.
 * - Parse natural-language searches.
 * - Perform enrichment.
 * - Score prospects.
 * - Qualify leads.
 * - Write to the Evidence Ledger.
 *
 * ARCHITECTURE:
 *
 * SearchIntent
 *      ↓
 * OfficialFloridaProvider
 *      ↓
 * FloridaRegistryDatabase
 *      ↓
 * SQLite
 *
 * The database is populated separately by the Florida
 * official-data ingestion process.
 */

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

class FloridaRegistryDatabase {

  /**
   * @param {Object} options
   * @param {string} [options.databasePath]
   */
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

    // ------------------------------------------------------------------------
    // Ensure database directory exists.
    // ------------------------------------------------------------------------

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

    // ------------------------------------------------------------------------
    // Open SQLite database.
    // ------------------------------------------------------------------------

    this.db =
      new Database(
        this.databasePath
      );

    // ------------------------------------------------------------------------
    // SQLite configuration.
    // ------------------------------------------------------------------------

    this.db.pragma(
      "journal_mode = WAL"
    );

    this.db.pragma(
      "foreign_keys = ON"
    );

    // ------------------------------------------------------------------------
    // Initialize schema.
    // ------------------------------------------------------------------------

    this.initializeSchema();
  }

  /**
   * Create the registry table and indexes.
   *
   * IMPORTANT:
   *
   * This schema stores observed registry data.
   * It does not store qualification decisions.
   */
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
        idx_florida_entities_mailing_zip
      ON florida_entities(mailing_zip);
    `);
  }

  /**
   * Search the locally ingested Florida registry.
   *
   * SearchIntent contract:
   *
   * {
   *   industry: {
   *     canonical,
   *     keywords,
   *     classifications
   *   },
   *   geography: {
   *     state,
   *     city,
   *     county,
   *     zip
   *   },
   *   limit
   * }
   *
   * IMPORTANT:
   *
   * The registry does NOT necessarily contain an industry classification
   * capable of directly identifying every business type.
   *
   * Therefore this first database implementation uses registry name
   * observations for discovery and leaves broader industry discovery
   * to the discovery/enrichment layers.
   */
  async search(searchIntent) {

    if (
      !searchIntent ||
      typeof searchIntent !== "object"
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

    if (state !== "FL") {
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

    // ------------------------------------------------------------------------
    // Build deterministic query.
    // ------------------------------------------------------------------------

    const conditions = [
      `
      (
        UPPER(principal_state) = @state
        OR
        UPPER(mailing_state) = @state
      )
      `
    ];

    const parameters = {
      state
    };

    // ------------------------------------------------------------------------
    // Geographic filtering.
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

    if (
      geography.zip
    ) {

      conditions.push(`
        (
          TRIM(principal_zip) =
            TRIM(@zip)

          OR

          TRIM(mailing_zip) =
            TRIM(@zip)
        )
      `);

      parameters.zip =
        String(
          geography.zip
        ).trim();
    }

    // ------------------------------------------------------------------------
    // Industry/name discovery.
    //
    // This is intentionally conservative.
    //
    // We are NOT claiming that a registry-name keyword proves industry
    // classification.
    // ------------------------------------------------------------------------

    const industryTerms = [
      industry.canonical,
      ...(Array.isArray(industry.keywords)
        ? industry.keywords
        : [])
    ]
      .map(
        value =>
          String(value || "")
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
      uniqueIndustryTerms.length
    ) {

      const industryConditions = [];

      uniqueIndustryTerms
        .slice(0, 10)
        .forEach(
          (term, index) => {

            const parameterName =
              `industryTerm${index}`;

            industryConditions.push(`
              LOWER(company_name)
                LIKE @${parameterName}
            `);

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
    // Query.
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
        ${conditions.join(
          " AND "
        )}

      ORDER BY
        company_name ASC

      LIMIT @limit
    `;

    parameters.limit =
      limit;

    const rows =
      this.db
        .prepare(sql)
        .all(parameters);

    return rows.map(
      row =>
        this.normalizeRecord(
          row
        )
    );
  }

  /**
   * Convert database row into the provider-neutral registry observation
   * structure.
   */
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

  /**
   * Insert or update an official registry record.
   *
   * This method will be used by the future Florida data-ingestion job.
   */
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

    const now =
      new Date().toISOString();

    const statement =
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

    statement.run({

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
    });
  }

  /**
   * Close the database connection.
   */
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
