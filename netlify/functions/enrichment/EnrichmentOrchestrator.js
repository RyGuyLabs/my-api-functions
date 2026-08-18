/**
 * EnrichmentOrchestrator
 *
 * Coordinates secondary enrichment providers after authoritative
 * entity verification.
 *
 * IMPORTANT:
 * Enrichment observations are NOT equivalent to registry facts.
 *
 * The orchestrator:
 * - Does not establish legal existence.
 * - Does not fabricate contact information.
 * - Does not assign qualification scores.
 * - Does not treat missing data as negative evidence.
 *
 * It collects independently sourced observations and preserves
 * provider-level provenance.
 */

const {
  WebsiteReconProvider
} = require("./websiterecon.js");

class EnrichmentOrchestrator {
  constructor(options = {}) {
    this.timeoutMs =
      Number(options.timeoutMs) || 8000;

    this.websiteRecon =
      options.websiteRecon ||
      new WebsiteReconProvider();

    /*
     * Future providers can be injected without changing the
     * orchestration contract.
     *
     * Example:
     *
     * this.contactSearch =
     *   options.contactSearch ||
     *   new ContactSearchProvider();
     */
    this.contactSearch =
      options.contactSearch || null;

    this.businessDirectory =
      options.businessDirectory || null;
  }

  /**
   * Enrich a verified entity.
   *
   * @param {Object} entity
   * @param {Object|null} candidateInfo
   * @returns {Promise<Object>}
   */
  async enrich(
    entity,
    candidateInfo = null
  ) {
    const startedAt =
      new Date().toISOString();

    const result = {
      website:
        this.normalizeWebsite(
          candidateInfo?.formattedUrl ||
          candidateInfo?.website ||
          entity?.website ||
          null
        ),

      businessPhone: null,

      emails: [],

      phones: [],

      digitalSignals: [],

      contacts: [],

      observations: [],

      providerResults: {},

      enrichmentStatus: "partial",

      errors: [],

      enrichedAt: startedAt
    };

    /*
     * ---------------------------------------------------------
     * 1. Determine website target
     * ---------------------------------------------------------
     */

    const targetUrl =
      result.website ||
      candidateInfo?.displayLink ||
      null;

    /*
     * No public website discovered.
     *
     * This is NOT an error.
     *
     * A business without a discovered website is an enrichment
     * limitation, not proof that no website exists.
     */
    if (!targetUrl) {
      result.enrichmentStatus =
        "partial";

      result.errors.push({
        stage: "discovery",
        provider: "EnrichmentOrchestrator",
        code: "NO_PUBLIC_WEBSITE",
        message:
          "No public web URL was identified for this entity."
      });

      return result;
    }

    /*
     * ---------------------------------------------------------
     * 2. Website Reconnaissance
     * ---------------------------------------------------------
     */

    await this.runWebsiteRecon(
      targetUrl,
      result
    );

    /*
     * ---------------------------------------------------------
     * 3. Contact Search
     *
     * Deliberately isolated so a failure here does NOT destroy
     * website reconnaissance results.
     * ---------------------------------------------------------
     */

    if (this.contactSearch) {
      await this.runContactSearch(
        entity,
        candidateInfo,
        result
      );
    }

    /*
     * ---------------------------------------------------------
     * 4. Optional business-directory enrichment
     * ---------------------------------------------------------
     */

    if (this.businessDirectory) {
      await this.runBusinessDirectorySearch(
        entity,
        candidateInfo,
        result
      );
    }

    /*
     * ---------------------------------------------------------
     * 5. Consolidate observations
     * ---------------------------------------------------------
     */

    this.consolidateContacts(result);

    /*
     * ---------------------------------------------------------
     * 6. Determine overall status
     * ---------------------------------------------------------
     */

    const hasSuccessfulProvider =
      Object.values(
        result.providerResults
      ).some(
        provider =>
          provider &&
          provider.status === "success"
      );

    const hasData =
      result.website ||
      result.emails.length > 0 ||
      result.phones.length > 0 ||
      result.contacts.length > 0 ||
      result.digitalSignals.length > 0;

    if (hasSuccessfulProvider && hasData) {
      result.enrichmentStatus =
        "complete";
    } else if (result.errors.length > 0) {
      result.enrichmentStatus =
        "partial";
    } else {
      result.enrichmentStatus =
        "no_data";
    }

    return result;
  }

  /**
   * Website reconnaissance.
   */
  async runWebsiteRecon(
    targetUrl,
    result
  ) {
    const providerName =
      "WebsiteReconProvider";

    try {
      const reconData =
        await this.withTimeout(
          this.websiteRecon.reconWebsite(
            targetUrl
          ),
          this.timeoutMs,
          providerName
        );

      result.providerResults.websiteRecon = {
        provider: providerName,
        status:
          reconData?.status === "success"
            ? "success"
            : "failed"
      };

      if (
        reconData?.status !== "success"
      ) {
        result.errors.push({
          stage: "websiteRecon",
          provider: providerName,
          code: "RECON_FAILED",
          message:
            reconData?.error ||
            "Website reconnaissance failed."
        });

        return;
      }

      /*
       * Preserve observations rather than assuming
       * every discovered value is authoritative.
       */

      result.emails =
        this.normalizeContactValues(
          reconData.emails
        );

      result.phones =
        this.normalizeContactValues(
          reconData.phones
        );

      result.digitalSignals =
        Array.isArray(
          reconData.digitalSignals
        )
          ? reconData.digitalSignals
          : [];

      result.observations.push({
        provider: providerName,
        sourceUrl: targetUrl,
        observedAt:
          new Date().toISOString(),
        observationType:
          "website_reconnaissance"
      });

    } catch (error) {
      result.providerResults.websiteRecon = {
        provider: providerName,
        status: "failed"
      };

      result.errors.push({
        stage: "websiteRecon",
        provider: providerName,
        code:
          error.code ||
          "RECON_EXCEPTION",
        message:
          error.message ||
          "Website reconnaissance failed."
      });
    }
  }

  /**
   * Contact search provider.
   *
   * This remains optional until the actual provider is
   * configured.
   */
  async runContactSearch(
    entity,
    candidateInfo,
    result
  ) {
    const providerName =
      this.contactSearch.name ||
      "ContactSearchProvider";

    try {
      const contactData =
        await this.withTimeout(
          this.contactSearch.search({
            companyName:
              entity?.companyName ||
              candidateInfo?.candidateName ||
              null,

            domain:
              this.extractDomain(
                result.website
              ),

            location:
              entity?.location ||
              null
          }),
          this.timeoutMs,
          providerName
        );

      result.providerResults.contactSearch = {
        provider: providerName,
        status: "success"
      };

      if (!contactData) {
        return;
      }

      if (
        Array.isArray(
          contactData.emails
        )
      ) {
        result.emails.push(
          ...this.normalizeContactValues(
            contactData.emails
          )
        );
      }

      if (
        Array.isArray(
          contactData.phones
        )
      ) {
        result.phones.push(
          ...this.normalizeContactValues(
            contactData.phones
          )
        );
      }

      if (
        Array.isArray(
          contactData.contacts
        )
      ) {
        result.contacts.push(
          ...contactData.contacts
        );
      }

      result.observations.push({
        provider: providerName,
        observedAt:
          new Date().toISOString(),
        observationType:
          "contact_enrichment"
      });

    } catch (error) {
      result.providerResults.contactSearch = {
        provider: providerName,
        status: "failed"
      };

      result.errors.push({
        stage: "contactSearch",
        provider: providerName,
        code:
          error.code ||
          "CONTACT_SEARCH_EXCEPTION",
        message:
          error.message ||
          "Contact search failed."
      });
    }
  }

  /**
   * Optional directory provider.
   */
  async runBusinessDirectorySearch(
    entity,
    candidateInfo,
    result
  ) {
    const providerName =
      this.businessDirectory.name ||
      "BusinessDirectoryProvider";

    try {
      const directoryData =
        await this.withTimeout(
          this.businessDirectory.search({
            companyName:
              entity?.companyName ||
              candidateInfo?.candidateName ||
              null,

            location:
              entity?.location ||
              null
          }),
          this.timeoutMs,
          providerName
        );

      result.providerResults.businessDirectory = {
        provider: providerName,
        status: "success"
      };

      if (!directoryData) {
        return;
      }

      if (directoryData.website) {
        result.website =
          result.website ||
          directoryData.website;
      }

      if (
        Array.isArray(
          directoryData.phones
        )
      ) {
        result.phones.push(
          ...directoryData.phones
        );
      }

      if (
        Array.isArray(
          directoryData.emails
        )
      ) {
        result.emails.push(
          ...directoryData.emails
        );
      }

    } catch (error) {
      result.providerResults.businessDirectory = {
        provider: providerName,
        status: "failed"
      };

      result.errors.push({
        stage: "businessDirectory",
        provider: providerName,
        code:
          error.code ||
          "DIRECTORY_EXCEPTION",
        message:
          error.message ||
          "Business directory enrichment failed."
      });
    }
  }

  /**
   * Consolidate and deduplicate contact observations.
   */
  consolidateContacts(result) {
    result.emails =
      this.dedupeContactValues(
        result.emails
      );

    result.phones =
      this.dedupeContactValues(
        result.phones
      );

    result.contacts =
      this.dedupeContacts(
        result.contacts
      );

    result.businessPhone =
      result.phones[0]?.value ||
      result.phones[0] ||
      null;
  }

  /**
   * Normalize provider contact values into
   * predictable objects.
   */
  normalizeContactValues(values) {
    if (!Array.isArray(values)) {
      return [];
    }

    return values
      .filter(Boolean)
      .map(value => {
        if (
          typeof value === "string"
        ) {
          return {
            value: value.trim(),
            sourceType: "public_web_observation"
          };
        }

        return {
          ...value,
          value:
            String(
              value.value || ""
            ).trim()
        };
      })
      .filter(
        value => value.value
      );
  }

  /**
   * Deduplicate emails / phones.
   */
  dedupeContactValues(values) {
    const seen =
      new Set();

    return values.filter(
      item => {
        const key =
          String(
            item.value || ""
          )
            .toLowerCase()
            .replace(
              /[\s().-]/g,
              ""
            );

        if (!key || seen.has(key)) {
          return false;
        }

        seen.add(key);

        return true;
      }
    );
  }

  /**
   * Deduplicate contact records.
   */
  dedupeContacts(contacts) {
    const seen =
      new Set();

    return contacts.filter(
      contact => {
        const key =
          [
            contact.name,
            contact.email,
            contact.phone
          ]
            .filter(Boolean)
            .join("|")
            .toLowerCase();

        if (!key || seen.has(key)) {
          return false;
        }

        seen.add(key);

        return true;
      }
    );
  }

  /**
   * Normalize a website URL.
   */
  normalizeWebsite(value) {
    if (!value) {
      return null;
    }

    try {
      const url =
        new URL(value);

      if (
        url.protocol !== "http:" &&
        url.protocol !== "https:"
      ) {
        return null;
      }

      return url.toString();

    } catch {
      return null;
    }
  }

  /**
   * Extract hostname.
   */
  extractDomain(url) {
    if (!url) {
      return null;
    }

    try {
      return new URL(url)
        .hostname
        .toLowerCase()
        .replace(
          /^www\./,
          ""
        );
    } catch {
      return null;
    }
  }

  /**
   * Hard execution boundary for secondary providers.
   */
  async withTimeout(
    promise,
    timeoutMs,
    providerName
  ) {
    let timeoutId;

    const timeoutPromise =
      new Promise(
        (_, reject) => {
          timeoutId =
            setTimeout(() => {
              const error =
                new Error(
                  `${providerName} exceeded ${timeoutMs}ms timeout.`
                );

              error.code =
                "ENRICHMENT_TIMEOUT";

              reject(error);
            }, timeoutMs);
        }
      );

    try {
      return await Promise.race([
        promise,
        timeoutPromise
      ]);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

module.exports = {
  EnrichmentOrchestrator
};
