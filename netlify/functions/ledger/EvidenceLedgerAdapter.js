import crypto from "crypto";
import { toCanonicalString } from "../CanonicalSerializer.js";

/**
 * In-Memory Evidence Store Adapter with Dual-Hash & Object.freeze() Protection
 */
export class EvidenceLedgerAdapter {
  constructor() {
    this.ledger = new Map();
  }

  /**
   * Generates a deterministic SHA-256 hash string for data inputs.
   */
  #hashData(data) {
    const canonicalStr = typeof data === "string" ? data : toCanonicalString(data);
    return crypto.createHash("sha256").update(canonicalStr).digest("hex");
  }

  /**
   * Records an observation with a 3-tier hash chain (Source, Canonical, Signal).
   */
  recordObservation({ providerName, rawPayload, normalizedEntity, sourceUrl, retrievedAt }) {
    const inputSignalId = `sig_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // 1. sourceContentHash: Raw payload fingerprint
    const sourceContentHash = this.#hashData(rawPayload);

    // 2. canonicalEntityHash: Normalized domain representation fingerprint
    const canonicalEntityHash = this.#hashData(normalizedEntity);

    // 3. signalRecordHash: Composite cryptographic binding
    const signalRecordHash = this.#hashData({
      inputSignalId,
      providerName,
      sourceContentHash,
      canonicalEntityHash,
      retrievedAt: retrievedAt || new Date().toISOString()
    });

    // Guard against accidental in-memory mutation using Object.freeze
    const entry = Object.freeze({
      inputSignalId,
      providerName,
      sourceUrl: sourceUrl || null,
      retrievedAt: retrievedAt || new Date().toISOString(),
      rawSourceReference: Object.freeze(JSON.parse(JSON.stringify(rawPayload))),
      normalizedEntity: Object.freeze(JSON.parse(JSON.stringify(normalizedEntity))),
      sourceContentHash,
      canonicalEntityHash,
      signalRecordHash
    });

    if (this.ledger.has(inputSignalId)) {
      throw new Error(`Evidence record collision: ${inputSignalId} already exists.`);
    }

    this.ledger.set(inputSignalId, entry);
    return entry;
  }

  getRecord(inputSignalId) {
    return this.ledger.get(inputSignalId) || null;
  }
}
