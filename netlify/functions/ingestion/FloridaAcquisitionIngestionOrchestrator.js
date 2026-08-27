// netlify/functions/ingestion/FloridaAcquisitionIngestionOrchestrator.js

const path = require("path");

/**
 * FloridaAcquisitionIngestionOrchestrator
 *
 * Coordinates end-to-end dataset acquisition, optional archive extraction,
 * and database ingestion for the Florida Division of Corporations registry
 * pipeline.
 *
 * RESPONSIBILITIES:
 * - Validate required service dependencies.
 * - Delegate file retrieval/caching to FloridaDatasetAcquisitionService.
 * - Extract quarterly master ZIP archives through FloridaDatasetArchiveService.
 * - Delegate parsed dataset persistence to FloridaIngestionService.
 * - Return unified acquisition/archive/ingestion manifests.
 */
class FloridaAcquisitionIngestionOrchestrator {
  /**
   * @param {Object} options
   * @param {Object} options.acquisitionService
   * @param {Object} options.ingestionService
   * @param {Object|null} [options.archiveService]
   */
  constructor({
    acquisitionService,
    ingestionService,
    archiveService = null
  } = {}) {
    if (
      !acquisitionService ||
      typeof acquisitionService.acquireDataset !== "function"
    ) {
      throw new Error(
        "Orchestrator requires a valid acquisitionService with acquireDataset()."
      );
    }

    if (
      !ingestionService ||
      typeof ingestionService.processFile !== "function"
    ) {
      throw new Error(
        "Orchestrator requires a valid ingestionService with processFile()."
      );
    }

    this.acquisitionService =
      acquisitionService;

    this.ingestionService =
      ingestionService;

    this.archiveService =
      archiveService;
  }

  /**
   * Executes the acquisition-to-ingestion pipeline.
   *
   * Daily:
   * acquisition -> ingestion
   *
   * Quarterly:
   * acquisition -> ZIP extraction -> ingestion
   *
   * @param {Object} [options]
   * @param {string} [options.acquisitionType="daily_delta"]
   * @param {string} [options.customSourceUrl]
   * @param {string} [options.outputFileName]
   * @param {number} [options.batchSize=2500]
   * @returns {Promise<{
   *   acquisition: Object,
   *   archive: Object|null,
   *   ingestion: Object
   * }>}
   */
  async runPipeline({
    acquisitionType = "daily_delta",
    customSourceUrl,
    outputFileName,
    batchSize = 2500
  } = {}) {
    if (
      acquisitionType !== "daily_delta" &&
      acquisitionType !== "quarterly_master"
    ) {
      throw new Error(
        `Unsupported acquisitionType: ${acquisitionType}`
      );
    }

    /*
     * Quarterly ZIP processing requires an archive service.
     * Reject before acquisition so we do not download/copy an archive
     * that cannot subsequently be processed.
     */
    if (
      acquisitionType === "quarterly_master" &&
      (
        !this.archiveService ||
        typeof this.archiveService.extractArchive !== "function"
      )
    ) {
      throw new Error(
        "Quarterly master processing requires a valid archiveService with extractArchive()."
      );
    }

    // Phase 1: Acquire dataset.
    const acquisition =
      await this.acquisitionService.acquireDataset({
        acquisitionType,
        customSourceUrl,
        outputFileName
      });

    if (
      !acquisition ||
      !acquisition.localFilePath
    ) {
      throw new Error(
        "Acquisition failed to produce a valid localFilePath."
      );
    }

    let archive = null;

    let ingestionFilePath =
      acquisition.localFilePath;

    /*
     * Phase 2 for quarterly master:
     * safely extract the single registry data payload.
     *
     * Daily delta files bypass archive handling entirely.
     */
    if (
      acquisitionType === "quarterly_master"
    ) {
      const extractionDirectory =
        path.join(
          path.dirname(
            acquisition.localFilePath
          ),
          "extracted_quarterly"
        );

      archive =
        await this.archiveService.extractArchive(
          acquisition.localFilePath,
          extractionDirectory
        );

      if (
        !archive ||
        !archive.extractedFilePath
      ) {
        throw new Error(
          "Archive extraction failed to produce a valid extractedFilePath."
        );
      }

      ingestionFilePath =
        archive.extractedFilePath;
    }

    // Final phase: ingest the raw fixed-width registry file.
    const ingestion =
      await this.ingestionService.processFile(
        ingestionFilePath,
        {
          acquisitionType:
            acquisition.acquisitionType ||
            acquisitionType,

          batchSize
        }
      );

    return {
      acquisition,
      archive,
      ingestion
    };
  }
}

module.exports = {
  FloridaAcquisitionIngestionOrchestrator
};
