/**
 * Test runner for CordataProvider adapter
 */
import fs from 'fs';
import path from 'path';
import { CordataProvider } from './CordataProvider.js';

function runStage3Test() {
  const filePath = path.resolve(process.cwd(), 'cordata0.txt');
  
  if (!fs.existsSync(filePath)) {
    console.log("ERROR: cordata0.txt not found in root.");
    return;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const records = content.match(/.{1,1440}/g) || [];

  const provider = new CordataProvider();
  console.log(`\n================ STAGE 3 PROVIDER ADAPTER TEST ================`);
  console.log(`Processing first 2 records via CordataProvider...\n`);

  const batchResults = provider.processBatch(records.slice(0, 2));

  batchResults.forEach((res, i) => {
    if (res.success) {
      console.log(`--- PROCESSED LEAD #${i + 1} [${res.lead.entity.legalName}] ---`);
      console.log(`Doc #:           ${res.lead.entity.documentNumber}`);
      console.log(`Provider:        ${res.lead.provider}`);
      console.log(`Primary Contact: ${res.lead.primaryContact ? res.lead.primaryContact.name : 'N/A'}`);
      console.log(`Evidence Ledger: Bound ${res.lead.evidenceLedger.recordLength} bytes raw string`);
      console.log(`----------------------------------------------------------------\n`);
    } else {
      console.error(`Failed to process record #${i + 1}: ${res.error}`);
    }
  });
}

runStage3Test();
