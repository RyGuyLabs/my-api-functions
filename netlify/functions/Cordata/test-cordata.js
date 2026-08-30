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
    .filter(line => Buffer.byteLength(line, 'utf8') === 1440);

  console.log(`Loaded ${records.length} exact 1,440-byte records.\n`);

  if (records.length === 0) {
    console.error('No exact 1,440-byte records found.');
    process.exit(1);
  }

  // Regression: multibyte UTF-8 text must not shift later byte-offset fields.
  const regressionBuffer = Buffer.alloc(1440, 0x20);

  regressionBuffer.write('T12345678901', 0, 'ascii');
  regressionBuffer.write('O’BRIEN UTF8 LLC', 12, 'utf8');
  regressionBuffer.write('TEST ', 204, 'ascii');
  regressionBuffer.write('08302026', 472, 'ascii');
  regressionBuffer.write('FL', 503, 'ascii');
  regressionBuffer.fill(0x00, 1436, 1440);

  const regressionRaw = regressionBuffer.toString('utf8');
  const regressionParsed = parseCordataRecord(regressionRaw);

  if (Buffer.byteLength(regressionRaw, 'utf8') !== 1440) {
    throw new Error('UTF-8 regression fixture must remain exactly 1,440 bytes');
  }

  if (regressionParsed.company.legalName !== 'O’BRIEN UTF8 LLC') {
    throw new Error(
      `UTF-8 legal-name regression failed: ${regressionParsed.company.legalName}`
    );
  }

  if (regressionParsed.company.filingDate !== '08302026') {
    throw new Error(
      `UTF-8 byte-offset regression shifted filingDate: ${regressionParsed.company.filingDate}`
    );
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

      const parsedByteLength =
        Buffer.byteLength(parsed.rawRecord, 'utf8');

      if (parsedByteLength !== 1440) {
        throw new Error(
          `Raw record byte length changed: ${parsedByteLength}`
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
