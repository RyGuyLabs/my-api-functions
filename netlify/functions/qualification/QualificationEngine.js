class QualificationEngine {

  /**
   * Evaluate a prospect using deterministic evidence.
   *
   * @param {Object} entity
   * @param {Object} enrichmentData
   * @param {Object} evidenceLedger
   * @returns {Object}
   */
  static evaluate(entity = {}, enrichmentData = {}, evidenceLedger = null) {

    const reasons = [];
    const signals = [];
    const evidence = [];

    const weights = {
      activeRegistration: 20,
      verifiedLocation: 10,
      reachableWebsite: 10,
      businessPhone: 10,
      businessEmail: 10
    };

    const configVersion = "qualification-v1.0";

    let score = 50;


    if (entity.status === "ACTIVE") {

      score += weights.activeRegistration;

      const reason = {
        code: "ACTIVE_REGISTRATION",
        message: `Verified ACTIVE state registration in ${entity.jurisdiction || "US"} (${entity.registrationId || "Registry Record"}).`,
        source: "registry"
      };

      reasons.push(reason.message);
      evidence.push(reason);

    } else {

      signals.push({
        code: "REGISTRATION_NOT_ACTIVE",
        message: "Entity status is inactive or could not be verified."
      });

    }

    /*
     * ------------------------------------------------------------------------
     * LOCATION VERIFICATION
     * ------------------------------------------------------------------------
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
      ].filter(Boolean).join(", ");

      const reason = {
        code: "VERIFIED_LOCATION",
        message: `Verified principal market: ${locationText}.`,
        source: "registry"
      };

      reasons.push(reason.message);
      evidence.push(reason);

    } else {

      signals.push({
        code: "LOCATION_INCOMPLETE",
        message: "Principal market could not be completely verified."
      });

    }

    /*
     * ------------------------------------------------------------------------
     * DATA SHAPE NORMALIZATION
     * Safely resolve nested website enrichment parameters
     * ------------------------------------------------------------------------
     */

    const websiteObj = (enrichmentData && typeof enrichmentData.website === "object" && enrichmentData.website !== null) 
      ? enrichmentData.website 
      : {};

    const websiteUrl = typeof enrichmentData.website === "string"
      ? enrichmentData.website
      : websiteObj.url || null;

    /*
     * ------------------------------------------------------------------------
     * WEBSITE ANALYSIS
     * ------------------------------------------------------------------------
     */

    const websiteExists = typeof websiteUrl === "string" && websiteUrl.trim().length > 0;

    if (websiteExists) {

      score += weights.reachableWebsite;

      const reason = {
        code: "WEBSITE_DISCOVERED",
        message: `Public website discovered: ${websiteUrl}`,
        source: "website_recon"
      };

      reasons.push(reason.message);
      evidence.push(reason);

    } else {

      signals.push({
        code: "MISSING_WEBSITE",
        message: "No public business website was identified."
      });

    }

    /*
     * ------------------------------------------------------------------------
     * PHONE CONTACTABILITY
     * ------------------------------------------------------------------------
     */

    const rawPhones = Array.isArray(enrichmentData.phones)
      ? enrichmentData.phones
      : Array.isArray(websiteObj.phones)
        ? websiteObj.phones
        : [];

    const validPhones = rawPhones.filter(
      phone => phone && typeof (typeof phone === "string" ? phone : phone.value) === "string" && (typeof phone === "string" ? phone : phone.value).trim()
    );

    if (validPhones.length > 0) {

      score += weights.businessPhone;

      const phone = validPhones[0];
      const phoneValue = typeof phone === "string" ? phone : phone.value;
      const phoneSource = typeof phone === "object" && phone.source ? phone.source : "website_recon";

      const reason = {
        code: "PHONE_DISCOVERED",
        message: `Business phone number discovered: ${phoneValue}`,
        source: phoneSource
      };

      reasons.push(reason.message);
      evidence.push(reason);

    } else {

      signals.push({
        code: "NO_PHONE_FOUND",
        message: "No publicly discoverable business phone number was identified."
      });

    }

    /*
     * ------------------------------------------------------------------------
     * EMAIL CONTACTABILITY
     * ------------------------------------------------------------------------
     */

    const rawEmails = Array.isArray(enrichmentData.emails)
      ? enrichmentData.emails
      : Array.isArray(websiteObj.emails)
        ? websiteObj.emails
        : [];

    const validEmails = rawEmails.filter(
      email => email && typeof (typeof email === "string" ? email : email.value) === "string" && (typeof email === "string" ? email : email.value).trim()
    );

    if (validEmails.length > 0) {

      score += weights.businessEmail;

      const email = validEmails[0];
      const emailValue = typeof email === "string" ? email : email.value;
      const emailSource = typeof email === "object" && email.source ? email.source : "website_recon";

      const reason = {
        code: "EMAIL_DISCOVERED",
        message: `Business email address discovered: ${emailValue}`,
        source: emailSource
      };

      reasons.push(reason.message);
      evidence.push(reason);

    } else {

      signals.push({
        code: "NO_EMAIL_FOUND",
        message: "No publicly discoverable business email address was identified."
      });

    }

    /*
     * ------------------------------------------------------------------------
     * DIGITAL SIGNALS
     * ------------------------------------------------------------------------
     */

    const rawSignals = Array.isArray(enrichmentData.digitalSignals)
      ? enrichmentData.digitalSignals
      : Array.isArray(websiteObj.digitalSignals)
        ? websiteObj.digitalSignals
        : null;

    if (Array.isArray(rawSignals)) {

      rawSignals
        .filter(Boolean)
        .forEach(signal => {

          signals.push({
            code: "DIGITAL_SIGNAL",
            message: String(signal)
          });

        });

    }



    const finalScore = Math.min(
      Math.max(score, 0),
      100
    );

    /*
     * ------------------------------------------------------------------------
     * PRIORITY
     * ------------------------------------------------------------------------
     */

    let priority = "STANDARD";

    if (finalScore >= 85) {
      priority = "HIGH PRIORITY";
    } else if (finalScore >= 70) {
      priority = "MEDIUM PRIORITY";
    }

   
    let recommendedAction =
      "Review available evidence and initiate the most appropriate outreach channel.";

    if (
      validEmails.length > 0 &&
      rawSignals?.length > 0
    ) {

      recommendedAction =
        "Initiate email outreach using the observed digital signals as the conversation trigger.";

    } else if (validEmails.length > 0) {

      recommendedAction =
        "Initiate business email outreach using the verified public contact channel.";

    } else if (validPhones.length > 0) {

      recommendedAction =
        "Initiate telephone outreach using the publicly discovered business number.";

    } else if (
      signals.some(signal => signal.code === "MISSING_WEBSITE")
    ) {

      recommendedAction =
        "Investigate the business through additional public sources before proposing a digital-presence solution.";

    } else {

      recommendedAction =
        "Perform additional public-source enrichment before initiating outreach.";
    }

  

    return {
      qualificationScore: finalScore,
      priority,

      qualificationReasons: reasons,

      salesSignals: signals,

      evidence,

      recommendedAction,

      scoring: {
        configVersion,
        baseScore: 50,
        appliedWeights: weights,
        finalScore
      },

      evidenceReference: evidenceLedger
        ? {
            inputSignalId: evidenceLedger.inputSignalId || null,
            contentHash:
              evidenceLedger.sourceContentHash ||
              evidenceLedger.contentHash ||
              null,
            signalRecordHash:
              evidenceLedger.signalRecordHash || null
          }
        : null,

      evaluatedAt: new Date().toISOString()
    };
  }
}

module.exports = { QualificationEngine };
