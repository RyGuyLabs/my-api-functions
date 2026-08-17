import { 
  calculateCanonicalContentHash, 
  validatePhase1Signal 
} from "../core/pipeline-implementation.js";
import { toCanonicalString } from "../core/CanonicalSerializer.js";

export class EvidenceLedgerAdapter {
  constructor() {
    this.ledger = new Map();
  }

  /**
   * Records an observation from a provider and converts it to a cryptographically bound Phase 1 Signal Record.
   */
  recordObservation({ providerName, rawPayload, normalizedEntity, sourceUrl, publishedAt }) {
    const canonicalPayloadStr = toCanonicalString(normalizedEntity);
    
    // Construct Phase 1 input matching raw signal schema
    const rawInput = {
      sourceUrl: sourceUrl || `https://registry.internal/${providerName.toLowerCase()}`,
      publishedAt: publishedAt || new Date().toISOString(),
      rawText: canonicalPayloadStr,
      entityName: normalizedEntity.companyName,
      jurisdiction: normalizedEntity.jurisdiction || "US",
    };

    // Pass through canonical validation & hashing
    const validationResult = validatePhase1Signal(rawInput);

    if (!validationResult.valid || !validationResult.record) {
      throw new Error(`Evidence Ledger Recording Failed: ${validationResult.error}`);
    }

    const signalRecord = validationResult.record;

    // Attach raw untouched provider representation separately for auditability
    const evidenceEntry = {
      ...signalRecord,
      rawSourceReference: rawPayload,
      providerName,
      recordedAt: new Date().toISOString()
    };

    this.ledger.set(signalRecord.inputSignalId, evidenceEntry);
    return evidenceEntry;
  }

  getRecord(inputSignalId) {
    return this.ledger.get(inputSignalId) || null;
  }

  getAllRecords() {
    return Array.from(this.ledger.values());
  }
}
