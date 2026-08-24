/**
 * Test runner for Stage 4 Database Staging
 */
import fs from 'fs';
import path from 'path';
import { CordataProvider } from './CordataProvider.js';
import { CordataStore } from './CordataStore.js';

function runStage4Test() {
  const filePath = path.resolve(process.cwd(), 'cordata0.txt');

  if (!fs.existsSync(filePath)) {
    console.log("ERROR: cordata0.txt not found.");
    return;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const records = content.match(/.{1,1440}/g) || [];

  const provider = new CordataProvider();
  console.log(`\n================ STAGE 4 DATABASE STAGING TEST ================`);

  const lead = provider.processRecord(records[0]);
  const sqlPayload = CordataStore.toSqlStatements(lead);

  console.log(`--- ENTITY PREPARED FOR DATABASE [${lead.entity.legalName}] ---`);
  console.log(`Doc #:               ${lead.entity.documentNumber}`);
  console.log(`Evidence Ledger SQL: Ready ($1 = ${sqlPayload.ledger.params[0]}, $2 = ${sqlPayload.ledger.params[1].length} bytes)`);
  console.log(`Entity SQL Query:    Generated with ${sqlPayload.entity.params.length} parameters`);
  console.log(`Officers Staged:     ${sqlPayload.officersCount} records ready for insert`);
  console.log(`----------------------------------------------------------------\n`);
}

runStage4Test();
