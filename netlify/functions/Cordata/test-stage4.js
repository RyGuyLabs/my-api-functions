import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { CordataProvider } from './CordataProvider.js';
import { CordataStore } from './CordataStore.js';

try {
  const filePath = path.resolve(process.cwd(), 'daily_sample.txt');
  const content = fs.readFileSync(filePath, 'utf-8');

  const records = content
    .split(/\r?\n/)
    .filter((line) => line.length === 1440);

  if (records.length === 0) {
    throw new Error('No valid 1440-byte records found in daily_sample.txt');
  }

  const provider = new CordataProvider();
  const lead = provider.processRecord(records[0]);
  const payload = CordataStore.prepareInsertPayload(lead);
  const sqlPayload = CordataStore.toSqlStatements(lead);

  // Document Number Assertions
  assert.strictEqual(lead.entity.documentNumber, 'L26000432480');

  // Payload Entity Record Assertions
  assert.strictEqual(payload.entityRecord.classificationCode, 'AFLAL');
  assert.strictEqual(payload.entityRecord.filingDate, '08162026');
  assert.strictEqual(payload.entityRecord.feiStatusRaw, 'N');
  assert.strictEqual(payload.entityRecord.jurisdictionCode, 'FL');

  // Payload Ledger Record Assertions
  assert.strictEqual(payload.ledgerRecord.documentNumber, 'L26000432480');
  assert.strictEqual(payload.ledgerRecord.rawRecord.length, 1440);

  // Officer Record Assertions (slotNumber === 2)
  const slot2Officer = payload.officerRecords.find((off) => off.slotNumber === 2);
  assert.ok(slot2Officer, 'Officer record with slotNumber === 2 should exist');
  assert.strictEqual(slot2Officer.firstName, 'JOANN');
  assert.strictEqual(slot2Officer.lastNameOrOrg, 'BORGES');
  assert.strictEqual(slot2Officer.streetAddress, '1120 SW 76TH COURT');
  assert.strictEqual(slot2Officer.state, 'FL');
  assert.strictEqual(slot2Officer.zip, '33144');

  // SQL Payload Assertions & Public Contract Validation
  assert.ok(sqlPayload.ledger && typeof sqlPayload.ledger.sql === 'string', 'sqlPayload.ledger.sql must be a string');
  assert.ok(Array.isArray(sqlPayload.ledger.params), 'sqlPayload.ledger.params must be an array');
  assert.strictEqual(sqlPayload.ledger.params[1].length, 1440);

  assert.ok(sqlPayload.entity && typeof sqlPayload.entity.sql === 'string', 'sqlPayload.entity.sql must be a string');
  assert.ok(Array.isArray(sqlPayload.entity.params), 'sqlPayload.entity.params must be an array');
  assert.strictEqual(sqlPayload.entity.params.length, 13);
  assert.ok(sqlPayload.entity.params.includes('AFLAL'), 'sqlPayload.entity.params must include AFLAL');
  assert.ok(sqlPayload.entity.params.includes('08162026'), 'sqlPayload.entity.params must include 08162026');
  assert.ok(sqlPayload.entity.params.includes('N'), 'sqlPayload.entity.params must include N');
  assert.ok(sqlPayload.entity.params.includes('FL'), 'sqlPayload.entity.params must include FL');

  assert.ok(sqlPayload.entity.sql.includes('classification_code'), 'sqlPayload.entity.sql must contain classification_code');
  assert.ok(sqlPayload.entity.sql.includes('fei_status_raw'), 'sqlPayload.entity.sql must contain fei_status_raw');
  assert.ok(sqlPayload.entity.sql.includes('jurisdiction_code'), 'sqlPayload.entity.sql must contain jurisdiction_code');

  assert.strictEqual(typeof sqlPayload.officersCount, 'number', 'sqlPayload.officersCount must be a number');

  console.log('✅ test-stage4.js PASSED: All Stage 4 persistence assertions verified.');
} catch (err) {
  console.error('❌ test-stage4.js FAILED:', err.message);
  process.exit(1);
}
