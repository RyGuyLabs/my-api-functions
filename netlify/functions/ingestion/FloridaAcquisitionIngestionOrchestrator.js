// netlify/functions/ingestion/FloridaAcquisitionIngestionOrchestrator.js

/**
 * FloridaAcquisitionIngestionOrchestrator
 *
 * Coordinates end-to-end dataset acquisition and database ingestion
 * for the Florida Division of Corporations registry pipeline.
 *
 * RESPONSIBILITIES:
 * - Validate acquisition parameters and enforce pre-flight guards.
 * - Delegate file retrieval/caching to FloridaDatasetAcquisitionService.
 * - Delegate file parsing/database persistence to FloridaIngestionService.
 * - Return unified { acquisition, ingestion } manifests.
 */
class FloridaAcquisitionIngestionOrchestrator {
  /**
   * @param {Object} options
   * @param {Object} options.acquisitionService - Instance of FloridaDatasetAcquisitionService
   * @param {Object} options.ingestionService - Instance of FloridaIngestionService
   */
  constructor({ acquisitionService, ingestionService } = {}) {
    if (!acquisitionService || typeof acquisitionService.acquireDataset !== "function") {
      throw new Error("Orchestrator requires a valid acquisitionService with acquireDataset().");
    }

    if (!ingestionService || typeof ingestionService.processFile !== "function") {
      throw new Error("Orchestrator requires a valid ingestionService with processFile().");
    }

    this.acquisitionService = acquisitionService;
    this.ingestionService = ingestionService;
  }

  /**
   * Executes the full acquisition-to-ingestion pipeline.
   *
   * @param {Object} [options]
   * @param {string} [options.acquisitionType="daily_delta"] - "daily_delta" or "quarterly_master"
   * @param {string} [options.customSourceUrl] - Optional URL or local path override for acquisition
   * @param {string} [options.outputFileName] - Optional custom filename for acquired file storage
   * @param {number} [options.batchSize=2500] - Database transaction batch size
   * @returns {Promise<{ acquisition: Object, ingestion: Object }>}
   */
  async runPipeline({
    acquisitionType = "daily_delta",
    customSourceUrl,
    outputFileName,
    batchSize = 2500
  } = {}) {
    // Pre-flight Guard: Reject quarterly_master BEFORE acquisition begins
    if (acquisitionType === "quarterly_master") {
      throw new Error(
        "Quarterly master processing is currently unsupported: automated ZIP archive extraction is not yet implemented. Pre-acquisition aborted."
      );
    }

    // Phase 1: Acquire Dataset (Always executed through FloridaDatasetAcquisitionService)
    const acquisition = await this.acquisitionService.acquireDataset({
      acquisitionType,
      customSourceUrl,
      outputFileName
    });

    if (!acquisition || !acquisition.localFilePath) {
      throw new Error("Acquisition failed to produce a valid localFilePath.");
    }

    // Phase 2: Ingest Dataset into Database
    const ingestion = await this.ingestionService.processFile(
      acquisition.localFilePath,
      {
        acquisitionType: acquisition.acquisitionType || acquisitionType,
        batchSize
      }
    );

    return {
      acquisition,
      ingestion
    };
  }
}

module.exports = {
  FloridaAcquisitionIngestionOrchestrator
};
