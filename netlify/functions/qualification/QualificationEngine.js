/**
 * QualificationEngine
 * Downstream subsystem responsible for calculating scores,
 * commercial signals, and recommended next actions.
 */
class QualificationEngine {
  static evaluate(entity, enrichmentData, evidenceLedger) {
    let score = 50; // Base baseline score
    const reasons = [];
    const signals = [];

    // Evaluate State Registration Facts
    if (entity.status === "ACTIVE") {
      score += 20;
      reasons.push(`Verified ACTIVE state registration in ${entity.jurisdiction} (${entity.registrationId || 'Registry Record'}).`);
    } else {
      reasons.push("Entity status is inactive or unverified.");
    }

    // Evaluate Location Attributes
    if (entity.location?.city) {
      score += 10;
      reasons.push(`Operating from verified principal market: ${entity.location.city}, ${entity.location.state}.`);
    }

    // Evaluate Enrichment Observations
    if (enrichmentData?.website) {
      score += 10;
      reasons.push(`Active web presence verified: ${enrichmentData.website}`);
    } else {
      signals.push("MISSING_WEBSITE: Candidate lacks an active web presence.");
    }

    if (enrichmentData?.phones?.length > 0) {
      score += 10;
      reasons.push(`Direct contact phone line identified (${enrichmentData.phones[0].value}).`);
    }

    if (enrichmentData?.emails?.length > 0) {
      score += 10;
      reasons.push(`Direct digital outreach channel verified (${enrichmentData.emails[0].value}).`);
    }

    // Evaluate Digital Weakness Signals
    if (enrichmentData?.digitalSignals?.length > 0) {
      enrichmentData.digitalSignals.forEach(sig => signals.push(`DIGITAL_WEAKNESS: ${sig}`));
    }

    // Normalize Score Bounds
    const finalScore = Math.min(Math.max(score, 0), 100);
    
    // Assign Priority Grade
    let priority = "STANDARD";
    if (finalScore >= 85) priority = "HIGH PRIORITY";
    else if (finalScore >= 70) priority = "MEDIUM PRIORITY";

    // Formulate Recommended Action
    let recommendedAction = "Initiate cold outreach via telephone or mailer.";
    if (enrichmentData?.emails?.length > 0) {
      recommendedAction = "Deploy introductory email pitch citing digital audit findings.";
    } else if (signals.some(s => s.includes("MISSING_WEBSITE"))) {
      recommendedAction = "Pitch custom web presence and digital branding solution.";
    }

    return {
      qualificationScore: finalScore,
      priority: priority,
      qualificationReasons: reasons,
      salesSignals: signals,
      recommendedAction: recommendedAction,
      evaluatedAt: new Date().toISOString()
    };
  }
}

module.exports = { QualificationEngine };
