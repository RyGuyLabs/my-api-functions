import fs from 'fs';
import path from 'path';
import { parseCordataRecord } from './CordataParser.js';

function runStage2Validation(filePath, count = 5) {
  console.log(`\n================ CORDATA STAGE 2 VALIDATION ================`);
  
  if (!fs.existsSync(filePath)) {
    console.error(`Error: Sample file not found at ${filePath}`);
    return;
  }

  const fileContent = fs.readFileSync(filePath, 'utf8');
  const records = fileContent.match(/.{1,1440}/g) || [];

  console.log(`Parsed ${records.length} records. Showing first ${count}:\n`);

  records.slice(0, count).forEach((rawRecord, index) => {
    try {
      const parsed = parseCordataRecord(rawRecord);
      console.log(`--- RECORD #${index + 1} [Doc: ${parsed.company.documentNumber}] ---`);
      console.log(`Legal Name: "${parsed.company.legalName}"`);
      console.log(`Principal:  "${parsed.principalAddress.street}, ${parsed.principalAddress.city}, ${parsed.principalAddress.state} ${parsed.principalAddress.zip}"`);
      console.log(`People/Slots (${parsed.people.length} found):`);
      parsed.people.forEach(p => {
        console.log(`   Slot ${p.slot}: ${p.roleAndNameRaw || p.nameRaw} | ${p.street}, ${p.city}, ${p.state} ${p.zip}`);
      });
      console.log(`------------------------------------------------------------\n`);
    } catch (err) {
      console.error(`Error parsing record #${index + 1}:`, err.message);
    }
  });
}

const samplePath = path.resolve(process.cwd(), 'cordata0.txt');
runStage2Validation(samplePath, 5);
