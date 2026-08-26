import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { CordataProvider } from './CordataProvider.js';

try {
  const filePath = path.resolve(process.cwd(), 'daily_sample.txt');
  const content = fs.readFileSync(filePath, 'utf-8');

  const records = content
    .split(/\r?\n/)
    .filter((line) => line.length === 1440);

  if (records.length < 2) {
    throw new Error(`Expected at least 2 valid 1440-byte records, found ${records.length}`);
  }

  const provider = new CordataProvider();
  const batchResults = provider.processBatch(records.slice(0, 2));

  // Batch-level assertions
  assert.strictEqual(batchResults.length, 2, 'Batch results length must be 2');
  assert.strictEqual(batchResults[0].success, true, 'Batch result 0 should be successful');
  assert.strictEqual(batchResults[1].success, true, 'Batch result 1 should be successful');

  const lead = batchResults[0].lead;

  // Provider & Ledger assertions
  assert.strictEqual(lead.provider, 'Florida_DOS_Cordata');
assert.strictEqual(lead.providerName, 'Florida_DOS_Cordata');

assert.strictEqual(typeof lead.processedAt, 'string');
assert.ok(lead.processedAt.length > 0, 'processedAt should be populated');

assert.strictEqual(lead.evidenceLedger.schemaVersion, 'DOS_1440_FIXED_WIDTH');
  assert.strictEqual(lead.evidenceLedger.recordLength, 1440);

  // Entity assertions
  const { entity, addresses, officers, primaryContact } = lead;
  assert.strictEqual(entity.documentNumber, 'L26000432480');
  assert.strictEqual(entity.legalName, 'JMB WRLD LLC');
  assert.strictEqual(entity.classificationCode, 'AFLAL');
  assert.strictEqual(entity.filingDate, '08162026');
  assert.strictEqual(entity.feiStatusRaw, 'N');
  assert.strictEqual(entity.jurisdictionCode, 'FL');

  // Address assertions
  assert.strictEqual(addresses.principal.address1, '1120 SW 76TH COURT');
  assert.strictEqual(addresses.principal.city, 'MIAMI');
  assert.strictEqual(addresses.principal.zip, '33144');

  assert.strictEqual(addresses.mailing.state, 'FL');
  assert.strictEqual(addresses.mailing.zip, '33144');

  // Officer assertions (slot === 2)
  const slot2Officer = officers.find((off) => off.slot === 2);
  assert.ok(slot2Officer, 'Officer with slot 2 should exist');
  assert.strictEqual(slot2Officer.role, 'AMBR');
  assert.strictEqual(slot2Officer.entityType, 'P');
  assert.strictEqual(slot2Officer.firstName, 'JOANN');
  assert.strictEqual(slot2Officer.lastNameOrOrg, 'BORGES');
  assert.strictEqual(slot2Officer.nameQualifier, 'M');
  assert.strictEqual(slot2Officer.street, '1120 SW 76TH COURT');
  assert.strictEqual(slot2Officer.city, 'MIAMI');
  assert.strictEqual(slot2Officer.state, 'FL');
  assert.strictEqual(slot2Officer.zip, '33144');

  // Primary Contact assertions
  assert.ok(primaryContact, 'Primary contact should exist');
  assert.strictEqual(primaryContact.slot, 2);
  assert.strictEqual(primaryContact.firstName, 'JOANN');
  assert.strictEqual(primaryContact.lastNameOrOrg, 'BORGES');
  assert.strictEqual(primaryContact.name, 'JOANN BORGES');

  console.log('✅ test-stage3.js PASSED: All Stage 3 CordataProvider contract assertions verified.');
} catch (err) {
  console.error('❌ test-stage3.js FAILED:', err.message);
  process.exit(1);
}
