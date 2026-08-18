class QualificationEngine {

  /**
   * Evaluate a prospect using deterministic evidence.
   *
   * IMPORTANT:
   * This engine does not use an LLM.
   * It does not invent facts.
   * It does not treat missing enrichment as negative proof.
   *
   * @param {Object} entity
   * @param {Object} enrichmentData
   * @param {Object} evidenceLedger
   * @returns {Object}
   */
  static evaluate(
    entity = {},
    enrichmentData = {},
    evidenceLedger = null
  ) {

    const reasons = [];
    const signals = [];
    const evidence = [];

    /*
     * ------------------------------------------------------------------------
     * DETERMINISTIC SCORING CONFIGURATION
     * ------------------------------------------------------------------------
     *
     * Base score = 50
     *
     * Maximum possible:
     * 50 + 20 + 10 + 10 + 10 + 10 = 110
     *
     * Final score is intentionally capped at 100.
     *
     * These weights represent qualification signals only.
     * They do NOT represent business value, revenue, or likelihood of purchase.
     */

    const weights = {
      activeRegistration: 20,
      verifiedLocation: 10,
      reachableWebsite: 10,
      businessPhone: 10,
      businessEmail: 10
    };

    const configVersion = "qualification-v1.1";

    const baseScore = 50;

    let score = baseScore;


    /*
     * ------------------------------------------------------------------------
     * 1. ACTIVE REGISTRATION
     * ------------------------------------------------------------------------
     *
     * This is the strongest authoritative signal because it originates from
     * the registry provider.
     */

    if (entity.status === "ACTIVE") {

      score += weights.activeRegistration;

      const reason = {
        code: "ACTIVE_REGISTRATION",

        message:
          `Verified ACTIVE state registration in ${entity.jurisdiction || "US"} ` +
          `(${entity.registrationId || "Registry Record"}).`,

        source: "registry"
      };

      reasons.push(reason.message);
      evidence.push(reason);

    } else {

      signals.push({
        code: "REGISTRATION_NOT_ACTIVE",

        message:
          "Entity status is inactive or could not be verified from the supplied registry evidence."
      });
    }


    /*
     * ------------------------------------------------------------------------
     * 2. LOCATION VERIFICATION
     * ------------------------------------------------------------------------
     *
     * Location is only scored when a structured city is actually present.
     */

    if (
      entity.location &&
      typeof entity.location === "object" &&
      entity.location.city
    ) {

      score += weights.verifiedLocation;

      const locationText = [
        entity.location.city,
        entity.location.state
      ]
        .filter(Boolean)
        .join(", ");

      const reason = {
        code: "VERIFIED_LOCATION",

        message:
          `Verified principal market: ${locationText}.`,

        source: "registry"
      };

      reasons.push(reason.message);
      evidence.push(reason);

    } else {

      signals.push({
        code: "LOCATION_INCOMPLETE",

        message:
          "A complete principal market could not be verified from the supplied registry evidence."
      });
    }


    /*
     * ------------------------------------------------------------------------
     * 3. ENRICHMENT DATA NORMALIZATION
     * ------------------------------------------------------------------------
     *
     * Supports both:
     *
     * enrichmentData.website = "https://example.com"
     *
     * and:
     *
     * enrichmentData.website = {
     *   url: "https://example.com"
     * }
     */

    const websiteObj =
      (
        enrichmentData &&
        typeof enrichmentData.website === "object" &&
        enrichmentData.website !== null
      )
        ? enrichmentData.website
        : {};

    const websiteUrl =
      typeof enrichmentData.website === "string"
        ? enrichmentData.website.trim()
        : typeof websiteObj.url === "string"
          ? websiteObj.url.trim()
          : null;


    /*
     * ------------------------------------------------------------------------
     * 4. WEBSITE OBSERVATION
     * ------------------------------------------------------------------------
     *
     * IMPORTANT:
     *
     * A discovered URL is NOT automatically proof that the website was
     * reachable or successfully retrieved.
     *
     * Therefore:
     * - "WEBSITE_DISCOVERED" is an observation.
     * - The score is only awarded when the enrichment layer indicates that
     *   the website was successfully processed.
     */

    const websiteExists =
      typeof websiteUrl === "string" &&
      websiteUrl.length > 0;

    const websiteReconSuccess =
      enrichmentData?.enrichmentStatus === "complete" ||
      enrichmentData?.providerResults?.websiteRecon?.status === "success" ||
      websiteObj?.reconStatus === "success" ||
      websiteObj?.status === "success";

    if (websiteExists) {

      const reason = {
        code: "WEBSITE_DISCOVERED",

        message:
          `Public website identified: ${websiteUrl}`,

        source: "website_recon"
      };

      reasons.push(reason.message);
      evidence.push(reason);

      /*
       * Only award the website score when the enrichment evidence indicates
       * successful website reconnaissance.
       */

      if (websiteReconSuccess) {

        score += weights.reachableWebsite;

        evidence.push({
          code: "WEBSITE_RECON_SUCCESS",
          message:
            `Website reconnaissance successfully processed ${websiteUrl}.`,
          source: "website_recon"
        });

      } else {

        signals.push({
          code: "WEBSITE_NOT_CONFIRMED_REACHABLE",

          message:
            "A public website URL was identified, but successful website retrieval was not established by the supplied enrichment evidence."
        });
      }

    } else {

      signals.push({
        code: "NO_PUBLIC_WEBSITE_IDENTIFIED",

        message:
          "No public business website was identified in the supplied enrichment evidence."
      });
    }


    /*
     * ------------------------------------------------------------------------
     * 5. PHONE CONTACTABILITY
     * ------------------------------------------------------------------------
     *
     * These are publicly observed contact values.
     * They are NOT treated as proof of ownership or guaranteed validity.
     */

    const rawPhones =
      Array.isArray(enrichmentData.phones)
        ? enrichmentData.phones
        : Array.isArray(websiteObj.phones)
          ? websiteObj.phones
          : [];

    const validPhones =
      rawPhones.filter(phone => {

        const value =
          typeof phone === "string"
            ? phone
            : phone?.value;

        return (
          typeof value === "string" &&
          value.trim().length > 0
        );
      });


    if (validPhones.length > 0) {

      score += weights.businessPhone;

      const phone =
        validPhones[0];

      const phoneValue =
        typeof phone === "string"
          ? phone
          : phone.value;

      const phoneSource =
        typeof phone === "object"
          ? (
              phone.sourceType ||
              phone.source ||
              "public_web_observation"
            )
          : "public_web_observation";

      const reason = {
        code: "PHONE_DISCOVERED",

        message:
          `Publicly observed business phone number: ${phoneValue}`,

        source:
          phoneSource
      };

      reasons.push(reason.message);
      evidence.push(reason);

    } else {

      signals.push({
        code: "NO_PUBLIC_PHONE_FOUND",

        message:
          "No publicly discoverable business phone number was identified."
      });
    }


    /*
     * ------------------------------------------------------------------------
     * 6. EMAIL CONTACTABILITY
     * ------------------------------------------------------------------------
     *
     * Same zero-trust principle as phone numbers.
     */

    const rawEmails =
      Array.isArray(enrichmentData.emails)
        ? enrichmentData.emails
        : Array.isArray(websiteObj.emails)
          ? websiteObj.emails
          : [];

    const validEmails =
      rawEmails.filter(email => {

        const value =
          typeof email === "string"
            ? email
            : email?.value;

        return (
          typeof value === "string" &&
          value.trim().length > 0
        );
      });


    if (validEmails.length > 0) {

      score += weights.businessEmail;

      const email =
        validEmails[0];

      const emailValue =
        typeof email === "string"
          ? email
          : email.value;

      const emailSource =
        typeof email === "object"
          ? (
              email.sourceType ||
              email.source ||
              "public_web_observation"
            )
          : "public_web_observation";

      const reason = {
        code: "EMAIL_DISCOVERED",

        message:
          `Publicly observed business email address: ${emailValue}`,

        source:
          emailSource
      };

      reasons.push(reason.message);
      evidence.push(reason);

    } else {

      signals.push({
        code: "NO_PUBLIC_EMAIL_FOUND",

        message:
          "No publicly discoverable business email address was identified."
      });
    }


    /*
     * ------------------------------------------------------------------------
     * 7. DIGITAL SIGNALS
     * ------------------------------------------------------------------------
     *
     * Digital signals are observations.
     * They do not independently increase the qualification score.
     */

    const rawSignals =
      Array.isArray(enrichmentData.digitalSignals)
        ? enrichmentData.digitalSignals
        : Array.isArray(websiteObj.digitalSignals)
          ? websiteObj.digitalSignals
          : [];

    if (Array.isArray(rawSignals)) {

      rawSignals
        .filter(Boolean)
        .forEach(signal => {

          signals.push({
            code: "DIGITAL_SIGNAL",

            message:
              typeof signal === "object"
                ? (
                    signal.message ||
                    signal.description ||
                    JSON.stringify(signal)
                  )
                : String(signal)
          });
        });
    }


    /*
     * ------------------------------------------------------------------------
     * 8. FINAL SCORE
     * ------------------------------------------------------------------------
     */

    const finalScore =
      Math.min(
        Math.max(
          score,
          0
        ),
        100
      );


    /*
     * ------------------------------------------------------------------------
     * 9. PRIORITY
     * ------------------------------------------------------------------------
     */

    let priority =
      "STANDARD";

    if (finalScore >= 85) {

      priority =
        "HIGH PRIORITY";

    } else if (finalScore >= 70) {

      priority =
        "MEDIUM PRIORITY";
    }


    /*
     * ------------------------------------------------------------------------
     * 10. RECOMMENDED ACTION
     * ------------------------------------------------------------------------
     *
     * Recommendations are derived from observable evidence.
     * They are not claims about the prospect's internal business condition.
     */

    let recommendedAction =
      "Review available evidence and initiate the most appropriate outreach channel.";

    if (
      validEmails.length > 0 &&
      rawSignals.length > 0
    ) {

      recommendedAction =
        "Initiate email outreach using the publicly observed contact channel and relevant digital observations as the conversation trigger.";

    } else if (
      validEmails.length > 0
    ) {

      recommendedAction =
        "Initiate business email outreach using the publicly observed contact channel.";

    } else if (
      validPhones.length > 0
    ) {

      recommendedAction =
        "Initiate telephone outreach using the publicly observed business number.";

    } else if (
      websiteExists
    ) {

      recommendedAction =
        "Review the identified public website and perform additional evidence-based enrichment before initiating outreach.";

    } else {

      recommendedAction =
        "Perform additional public-source enrichment before initiating outreach.";
    }


    /*
     * ------------------------------------------------------------------------
     * 11. RETURN CONTRACT
     * ------------------------------------------------------------------------
     */

    return {

      qualificationScore:
        finalScore,

      priority,

      qualificationReasons:
        reasons,

      salesSignals:
        signals,

      evidence,

      recommendedAction,

      scoring: {

        configVersion,

        baseScore,

        appliedWeights:
          weights,

        finalScore
      },

      evidenceReference:
        evidenceLedger
          ? {

              inputSignalId:
                evidenceLedger.inputSignalId ||
                null,

              contentHash:
                evidenceLedger.sourceContentHash ||
                evidenceLedger.contentHash ||
                null,

              signalRecordHash:
                evidenceLedger.signalRecordHash ||
                null
            }

          : null,

      evaluatedAt:
        new Date().toISOString()
    };
  }
}

module.exports = {
  QualificationEngine
};
