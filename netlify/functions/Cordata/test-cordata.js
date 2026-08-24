import fs from 'node:fs';
import path from 'node:path';
import { parseCordataRecord } from './CordataParser.js';

const sampleFilePath = path.resolve('./daily_sample.txt');

function runValidation() {
  console.log('--- STAGE 2: CORDATA DECODER VALIDATION ---');

  if (!fs.existsSync(sampleFilePath)) {
    console.error(`Error: Sample file not found at ${sampleFilePath}`);
    process.exit(1);
  }

  const fileContent = fs.readFileSync(sampleFilePath, 'utf8');

  const records = fileContent
    .split(/\r?\n/)
    .filter(line => line.length === 1440);

  console.log(`Loaded ${records.length} exact 1,440-character records.\n`);

  if (records.length === 0) {
    console.error('No exact 1,440-character records found.');
    process.exit(1);
  }

  const sampleCount = Math.min(20, records.length);

  let errorCount = 0;

  for (let i = 0; i < sampleCount; i++) {
    try {
      const parsed = parseCordataRecord(records[i]);

      if (!parsed.company.documentNumber) {
        throw new Error('Missing document number');
      }

      if (!parsed.company.legalName) {
        throw new Error('Missing legal name');
      }

      if (parsed.rawRecord.length !== 1440) {
        throw new Error(
          `Raw record length changed: ${parsed.rawRecord.length}`
        );
      }
    } catch (err) {
      console.error(`[Record ${i + 1}] FAILED: ${err.message}`);
      errorCount++;
    }
  }

  console.log('\n--- SAMPLE PARSED RECORD ---');

  const firstRecord = parseCordataRecord(records[0]);

  console.dir(
    {
      company: firstRecord.company,
      principalAddress: firstRecord.principalAddress,
      mailingAddress: firstRecord.mailingAddress,
      people: firstRecord.people
    },
    {
      depth: null,
      maxArrayLength: 20
    }
  );

  console.log('\n--- VALIDATION SUMMARY ---');
  console.log(`Processed: ${sampleCount}`);
  console.log(`Errors:    ${errorCount}`);

  if (errorCount === 0) {
    console.log('\nSTAGE 2 BASIC VALIDATION: PASSED');
  } else {
    console.log('\nSTAGE 2 BASIC VALIDATION: FAILED');
    process.exitCode = 1;
  }
}

runValidation();
