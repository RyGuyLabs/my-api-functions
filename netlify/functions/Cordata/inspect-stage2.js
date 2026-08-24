// cordata/inspect-stage2.js
import fs from 'fs';
import path from 'path';
import { parseCordataRecord } from './CordataParser.js';

function inspectStage2() {
  const filePath = path.resolve(process.cwd(), 'cordata0.txt');
  
  if (!fs.existsSync(filePath)) {
    console.log("ERROR: cordata0.txt not found in root directory.");
    return;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const records = content.match(/.{1,1440}/g) || [];

  console.log(`=== STAGE 2 VALIDATION REPORT (${records.length} Records Analyzed) ===\n`);

  const anomalies = [];

  records.forEach((raw, idx) => {
    try {
      const parsed = parseCordataRecord(raw);
      
      // Check for common offset bleed anomalies
      const c = parsed.company;
      const p = parsed.principalAddress;
      
      // Anomaly checks
      if (!c.documentNumber || c.documentNumber.length < 6) {
        anomalies.push(`Rec #${idx + 1}: Doc Number suspicious -> "${c.documentNumber}"`);
      }
      if (p.zip && p.zip.length < 5) {
        anomalies.push(`Rec #${idx + 1}: Principal ZIP short/invalid -> "${p.zip}"`);
      }
      if (c.legalName.includes('FL34223') || p.city.includes('FL')) {
        anomalies.push(`Rec #${idx + 1}: State/ZIP bleed detected in Name/City`);
      }

      // Print first 3 parsed records as concrete proof
      if (idx < 3) {
        console.log(`--- SAMPLE PARSED RECORD #${idx + 1} ---`);
        console.log(JSON.stringify(parsed, null, 2));
        console.log('-----------------------------------------\n');
      }

    } catch (err) {
      anomalies.push(`Rec #${idx + 1}: Parsing Error -> ${err.message}`);
    }
  });

  console.log(`=== ANOMALY & ALIGNMENT SUMMARY ===`);
  if (anomalies.length === 0) {
    console.log("SUCCESS: 0 structural anomalies detected across record set!");
  } else {
    console.log(`Found ${anomalies.length} potential alignment issues to check:`);
    anomalies.slice(0, 10).forEach(a => console.log(` - ${a}`));
  }
}

inspectStage2();
