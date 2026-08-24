// cordata/test-cordata.js
import fs from 'node:fs';
import path from 'node:path';
import { CordataParser } from './CordataParser.js';

const sampleFilePath = path.resolve('./daily_sample.txt');

function runValidation() {
  console.log('--- STAGE 2: CORDATA DECODER VALIDATION ---');
  
  if (!fs.existsSync(sampleFilePath)) {
    console.error(`Error: Sample file not found at ${sampleFilePath}`);
    process.exit(1);
  }

  const fileContent = fs.readFileSync(sampleFilePath, 'utf-8');
  const lines = fileContent.split('\n').filter(l => l.length >= 200);

  console.log(`Loaded ${lines.length} valid records from daily_sample.txt.\n`);

  const sampleCount = Math.min(20, lines.length);
  const parsedRecords = [];
  let errorCount = 0;

  for (let i = 0; i < sampleCount; i++) {
    try {
      const parsed = CordataParser.parseRecord(lines[i]);
      parsedRecords.push(parsed);

      // Validation Checks (catch offset misalignments)
      if (!parsed.legalName || parsed.legalName.length < 2) {
        console.warn(`[Line ${i + 1}] Warning: Unusually short legalName: "${parsed.legalName}"`);
        errorCount++;
      }
      if (parsed.principalAddress.zip && !/^\d{5}/.test(parsed.principalAddress.zip)) {
        console.warn(`[Line ${i + 1}] Warning: Malformed Zip Code detected: "${parsed.principalAddress.zip}"`);
      }
    } catch (err) {
      console.error(`[Line ${i + 1}] Parsing failed:`, err.message);
      errorCount++;
    }
  }

  console.log('--- SAMPLE PARSED RECORD (RECORD #1) ---');
  console.log(JSON.stringify(parsedRecords[0], null, 2));

  console.log('\n--- VALIDATION SUMMARY ---');
  console.log(`Processed: ${sampleCount} records`);
  console.log(`Errors/Warnings: ${errorCount}`);
  console.log(errorCount === 0 ? 'STATUS: SUCCESS (100% Valid Offsets)' : 'STATUS: REQUIRES OFFSET ADJUSTMENT');
}

runValidation();
