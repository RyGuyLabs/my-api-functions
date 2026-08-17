const crypto = require("crypto");
const { toCanonicalString } = require("../source/CanonicalSerializer.js");

class EvidenceLedgerAdapter {
  constructor() {
    this.ledger = new Map();
  }

  #hashData(data) {
    const canonicalStr = typeof data === "string" ? data : toCanonicalString(data);
    return crypto.createHash("sha256").update(canonicalStr).digest("hex");
  }

  recordObservation({ providerName, rawPayload, normalizedEntity, sourceUrl, retrievedAt }) {
    const inputSignalId = `sig_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const sourceContentHash = this.#hashData(rawPayload);
    const canonicalEntityHash = this.#hashData(normalizedEntity);

    const signalRecordHash = this.#hashData({
      inputSignalId,
      providerName,
      sourceContentHash,
      canonicalEntityHash,
      retrievedAt: retrievedAt || new Date().toISOString()
    });

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

module.exports = { EvidenceLedgerAdapter };
