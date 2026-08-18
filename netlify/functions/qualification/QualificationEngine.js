/**
 * QualificationEngine
 *
 * Downstream qualification subsystem.
 *
 * IMPORTANT:
 * This engine evaluates observable evidence. It does not invent
 * business facts, contacts, revenue, employee counts, or weaknesses.
 *
 * Architecture:
 *
 * Registry Evidence
 *        ↓
 * Enrichment Evidence
 *        ↓
 * Observable Signals
 *        ↓
 * Deterministic Qualification
 *        ↓
 * Recommended Next Action
 */
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

    /*
     * ------------------------------------------------------------------------
     * SCORE CONFIGURATION
     * ------------------------------------------------------------------------
     *
     * Keep weights centralized so scoring can later become versioned/configured
     * without rewriting qualification logic.
     */

    const weights = {
      activeRegistration: 20,
      verifiedLocation: 10,
      reachableWebsite: 10,
      businessPhone: 10,
      businessEmail: 10
    };

    const configVersion = "qualification-v1.0";

    let score = 50;

    /*
     * ------------------------------------------------------------------------
     * REGISTRY VERIFICATION
     * ------------------------------------------------------------------------
     */

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
     * WEBSITE ANALYSIS
     * ------------------------------------------------------------------------
     */

    const websiteExists =
      typeof enrichmentData.website === "string" &&
      enrichmentData.website.trim().length > 0;

    if (websiteExists) {

      score += weights.reachableWebsite;

      const reason = {
        code: "WEBSITE_DISCOVERED",
        message: `Public website discovered: ${enrichmentData.website}`,
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

    const validPhones = Array.isArray(enrichmentData.phones)
      ? enrichmentData.phones.filter(
          phone => phone && typeof phone.value === "string" && phone.value.trim()
        )
      : [];

    if (validPhones.length > 0) {

      score += weights.businessPhone;

      const phone = validPhones[0];

      const reason = {
        code: "PHONE_DISCOVERED",
        message: `Business phone number discovered: ${phone.value}`,
        source: phone.source || "website_recon"
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

    const validEmails = Array.isArray(enrichmentData.emails)
      ? enrichmentData.emails.filter(
          email => email && typeof email.value === "string" && email.value.trim()
        )
      : [];

    if (validEmails.length > 0) {

      score += weights.businessEmail;

      const email = validEmails[0];

      const reason = {
        code: "EMAIL_DISCOVERED",
        message: `Business email address discovered: ${email.value}`,
        source: email.source || "website_recon"
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

    if (Array.isArray(enrichmentData.digitalSignals)) {

      enrichmentData.digitalSignals
        .filter(Boolean)
        .forEach(signal => {

          signals.push({
            code: "DIGITAL_SIGNAL",
            message: String(signal)
          });

        });

    }

    /*
     * ------------------------------------------------------------------------
     * SCORE NORMALIZATION
     * ------------------------------------------------------------------------
     */

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

    /*
     * ------------------------------------------------------------------------
     * RECOMMENDED NEXT ACTION
     * ------------------------------------------------------------------------
     */

    let recommendedAction =
      "Review available evidence and initiate the most appropriate outreach channel.";

    if (
      validEmails.length > 0 &&
      enrichmentData.digitalSignals?.length > 0
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

    /*
     * ------------------------------------------------------------------------
     * FINAL RESULT
     * ------------------------------------------------------------------------
     */

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
