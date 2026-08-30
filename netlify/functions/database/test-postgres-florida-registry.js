'use strict';

const assert = require('node:assert/strict');

const {
  PostgresFloridaRegistryDatabase
} = require('./PostgresFloridaRegistryDatabase');

const TEST_PREFIX = `PGTEST_${Date.now()}`;

const IDS = {
  single: `${TEST_PREFIX}_SINGLE`,
  batch1: `${TEST_PREFIX}_BATCH1`,
  batch2: `${TEST_PREFIX}_BATCH2`,
  full: `${TEST_PREFIX}_FULL`,
  rollback: `${TEST_PREFIX}_ROLLBACK`
};

const MANIFEST_SOURCE_FILE =
  `${TEST_PREFIX}_manifest.txt`;

function makeEntity({
  registrationId,
  companyName,
  city = 'MIAMI',
  state = 'FL',
  zip = '33144',
  classificationCode = null
}) {
  return {
    registrationId,
    companyName,
    entityType: 'LLC',
    status: 'ACTIVE',
    formationDate: '20260827',

    principalAddress: {
      line1: '100 TEST STREET',
      line2: null,
      city,
      state,
      zip
    },

    mailingAddress: {
      line1: 'PO BOX 100',
      line2: null,
      city,
      state,
      zip
    },

    registeredAgent: 'TEST REGISTERED AGENT',

    source: {
      file: `${TEST_PREFIX}.txt`,
      sourceType: 'official_state_dataset',
      retrievedAt: '2026-08-27T20:00:00.000Z',
      recordUpdatedAt: '2026-08-27T20:00:00.000Z'
    },

    classificationCode,
    feiNumber: '123456789',
    feiStatusRaw: 'N',
    jurisdictionCode: 'FL'
  };
}

async function cleanup(pool) {
  await pool.query(
    `
      DELETE FROM ingestion_manifests
      WHERE source_file = $1
    `,
    [MANIFEST_SOURCE_FILE]
  );

  await pool.query(
    `
      DELETE FROM florida_entities
      WHERE registration_id LIKE $1
    `,
    [`${TEST_PREFIX}%`]
  );
}

async function run() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required to run the PostgreSQL integration test.'
    );
  }

  const db =
    new PostgresFloridaRegistryDatabase({
      connectionString: process.env.DATABASE_URL
    });

  let pool = null;

  try {
    console.log(
      '1. initializeSchema'
    );

    await db.initializeSchema();

    pool = await db.getPool();

    await cleanup(pool);

    // ------------------------------------------------------------------
    // TEST 1: upsertRecord
    // ------------------------------------------------------------------

    console.log(
      '2. upsertRecord'
    );

    const singleRecord =
      makeEntity({
        registrationId: IDS.single,
        companyName:
          'RYGUY POSTGRES SINGLE TEST LLC',
        classificationCode:
          'TEST-CODE'
      });

    const singleCount =
      await db.upsertRecord(singleRecord);

    assert.equal(
      singleCount,
      1
    );

    let result =
      await pool.query(
        `
          SELECT *
          FROM florida_entities
          WHERE registration_id = $1
        `,
        [IDS.single]
      );

    assert.equal(
      result.rowCount,
      1
    );

    assert.equal(
      result.rows[0].company_name,
      'RYGUY POSTGRES SINGLE TEST LLC'
    );

    assert.equal(
      result.rows[0].classification_code,
      'TEST-CODE'
    );

    assert.equal(
      result.rows[0].fei_number,
      '123456789'
    );

    assert.equal(
      result.rows[0].jurisdiction_code,
      'FL'
    );

    // ------------------------------------------------------------------
    // TEST 2: upsertBatch
    // ------------------------------------------------------------------

    console.log(
      '3. upsertBatch'
    );

    const batchCount =
      await db.upsertBatch([
        makeEntity({
          registrationId: IDS.batch1,
          companyName:
            'RYGUY POSTGRES BATCH ONE LLC'
        }),

        makeEntity({
          registrationId: IDS.batch2,
          companyName:
            'RYGUY POSTGRES BATCH TWO LLC'
        })
      ]);

    assert.equal(
      batchCount,
      2
    );

    result =
      await pool.query(
        `
          SELECT registration_id
          FROM florida_entities
          WHERE registration_id IN ($1, $2)
        `,
        [
          IDS.batch1,
          IDS.batch2
        ]
      );

    assert.equal(
      result.rowCount,
      2
    );

    // ------------------------------------------------------------------
    // TEST 3: full-record bundle
    // raw evidence + people
    // ------------------------------------------------------------------

    console.log(
      '4. upsertFullRecordBatch'
    );

    const raw1440 =
      'R'.repeat(1440);

    const fullRecord =
      makeEntity({
        registrationId: IDS.full,
        companyName:
          'RYGUY SOLAR POSTGRES FULL TEST LLC'
      });

    const fullCount =
      await db.upsertFullRecordBatch([
        {
          parsed: fullRecord,
          raw: raw1440,

          people: [
            {
              title: 'AMBR',
              name: 'RYAN TEST ONE',
              address: {
                line1: '101 TEST STREET',
                line2: null,
                city: 'MIAMI',
                state: 'FL',
                zip: '33144'
              }
            },

            {
              title: 'MGR',
              name: 'RYAN TEST TWO',
              address: {
                line1: '102 TEST STREET',
                line2: null,
                city: 'MIAMI',
                state: 'FL',
                zip: '33144'
              }
            }
          ]
        }
      ]);

    assert.equal(
      fullCount,
      1
    );

    result =
      await pool.query(
        `
          SELECT raw_line
          FROM florida_raw_records
          WHERE registration_id = $1
        `,
        [IDS.full]
      );

    assert.equal(
      result.rowCount,
      1
    );

    assert.equal(
      result.rows[0].raw_line.length,
      1440
    );

    assert.equal(
      result.rows[0].raw_line,
      raw1440
    );

    result =
      await pool.query(
        `
          SELECT name, person_title
          FROM florida_people
          WHERE registration_id = $1
          ORDER BY name ASC
        `,
        [IDS.full]
      );

    assert.equal(
      result.rowCount,
      2
    );

    // ------------------------------------------------------------------
    // TEST 4: people replacement semantics
    // ------------------------------------------------------------------

    console.log(
      '5. people replacement'
    );

    await db.upsertFullRecordBatch([
      {
        parsed: fullRecord,
        raw: raw1440,

        people: [
          {
            title: 'CEO',
            name: 'REPLACEMENT PERSON',
            address: {
              line1:
                '200 REPLACEMENT STREET',
              line2: null,
              city: 'MIAMI',
              state: 'FL',
              zip: '33144'
            }
          }
        ]
      }
    ]);

    result =
      await pool.query(
        `
          SELECT name, person_title
          FROM florida_people
          WHERE registration_id = $1
        `,
        [IDS.full]
      );

    assert.equal(
      result.rowCount,
      1
    );

    assert.equal(
      result.rows[0].name,
      'REPLACEMENT PERSON'
    );

    assert.equal(
      result.rows[0].person_title,
      'CEO'
    );

    // ------------------------------------------------------------------
    // TEST 5: normalized search behavior
    // ------------------------------------------------------------------

    console.log(
      '6. search parity'
    );

    const searchResults =
      await db.search({
        geography: {
          state: 'FL',
          city: 'MIAMI',
          zip: '33144'
        },

        industry: {
          canonical: 'solar',
          keywords: [
            'solar'
          ]
        },

        limit: 10
      });

    const matched =
      searchResults.find(
        record =>
          record.registrationId ===
          IDS.full
      );

    assert.ok(
      matched,
      'Expected PostgreSQL search to return the test solar company.'
    );

    assert.equal(
      matched.companyName,
      'RYGUY SOLAR POSTGRES FULL TEST LLC'
    );

    assert.equal(
      matched.status,
      'ACTIVE'
    );

    assert.equal(
      matched.principalAddress.city,
      'MIAMI'
    );

    assert.equal(
      matched.principalAddress.state,
      'FL'
    );

    assert.equal(
      matched.principalAddress.zip,
      '33144'
    );

    assert.equal(
      matched.source.sourceType,
      'official_state_dataset'
    );

    // ------------------------------------------------------------------
    // TEST 6: unsupported-state behavior
    // ------------------------------------------------------------------

    console.log(
      '7. non-Florida search'
    );

    const nonFlorida =
      await db.search({
        geography: {
          state: 'GA'
        },
        limit: 10
      });

    assert.deepEqual(
      nonFlorida,
      []
    );

    // ------------------------------------------------------------------
    // TEST 7: ingestion manifest
    // ------------------------------------------------------------------

    console.log(
      '8. ingestion manifest'
    );

    await db.recordIngestionManifest({
      source:
        'Florida Department of State',
      acquisitionType:
        'integration_test',
      sourceFile:
        MANIFEST_SOURCE_FILE,
      sourceFileSha256:
        'abc123',
      fileSizeBytes:
        1440,
      retrievedAt:
        '2026-08-27T20:00:00.000Z',
      linesRead:
        1,
      validRecords:
        1,
      rejectedRecords:
        0,
      recordsIngested:
        1,
      executionTimeSeconds:
        0.1,
      status:
        'COMPLETED'
    });

    result =
      await pool.query(
        `
          SELECT *
          FROM ingestion_manifests
          WHERE source_file = $1
        `,
        [MANIFEST_SOURCE_FILE]
      );

    assert.equal(
      result.rowCount,
      1
    );

    assert.equal(
      result.rows[0].records_ingested,
      1
    );

    assert.equal(
      result.rows[0].status,
      'COMPLETED'
    );

    // ------------------------------------------------------------------
    // TEST 8: transaction rollback
    // ------------------------------------------------------------------

    console.log(
      '9. transaction rollback'
    );

    let rollbackTriggered =
      false;

    try {
      await db.upsertFullRecordBatch([
        {
          parsed:
            makeEntity({
              registrationId:
                IDS.rollback,
              companyName:
                'RYGUY ROLLBACK TEST LLC'
            }),

          raw:
            'X'.repeat(1440),

          people: []
        },

        {
          parsed: {
            registrationId:
              `${TEST_PREFIX}_INVALID`

            // companyName intentionally absent
          },

          raw:
            'Y'.repeat(1440),

          people: []
        }
      ]);
    } catch (error) {
      rollbackTriggered =
        true;
    }

    assert.equal(
      rollbackTriggered,
      true,
      'Expected malformed second bundle to trigger rollback.'
    );

    result =
      await pool.query(
        `
          SELECT registration_id
          FROM florida_entities
          WHERE registration_id = $1
        `,
        [IDS.rollback]
      );

    assert.equal(
      result.rowCount,
      0,
      'First record must not survive a failed transaction.'
    );

    console.log('');
    console.log(
      'PostgreSQL Florida Registry integration test PASSED.'
    );
  } finally {
    if (pool) {
      try {
        await cleanup(pool);
      } catch (cleanupError) {
        console.error(
          'Test cleanup failed:',
          cleanupError.message
        );
      }
    }

    await db.close();
  }
}

run().catch(error => {
  console.error('');
  console.error(
    'PostgreSQL Florida Registry integration test FAILED.'
  );

  console.error(
    error
  );

  process.exitCode = 1;
});
