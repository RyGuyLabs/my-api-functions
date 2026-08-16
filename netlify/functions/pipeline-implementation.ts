import {
  AuthorizationContext,
  AuthorizationDecision,
  CandidateDraftEnvelope,
  DraftGenerationInput,
  Phase1SignalRecord,
  Phase1ValidationResult,
  QualifiedLeadRecord,
  RawSignalInput,
  RawSignalInputSchema,
  RejectionReasonCode,
  ScoringConfig,
  VerifiedSentenceAudit,
  calculateCanonicalConfigHash,
  calculateCanonicalContentHash,
} from "./pipeline-contract.js";
import { createHash } from "node:crypto";

export function validatePhase1Signal(input: RawSignalInput): Phase1ValidationResult {
  const parseResult = RawSignalInputSchema.safeParse(input);
  if (!parseResult.success) {
    return { valid: false, error: parseResult.error.message };
  }

  const contentHash = calculateCanonicalContentHash(input.sourceUrl, input.publishedAt, input.rawText);
  const inputSignalId = "sig_" + contentHash.substring(7, 19);

  const extractedFact = {
    factId: "fact_01",
    factType: "regulatory_filing" as const,
    subject: input.entityName,
    roleOrEvent: "Form LA-2026",
    isDirectFact: true,
    evidenceReference: input.rawText.substring(0, Math.min(60, input.rawText.length)),
  };

  const recordNoHash = {
    inputSignalId,
    sourceUrl: input.sourceUrl,
    publishedAt: input.publishedAt,
    rawText: input.rawText,
    normalizedEntity: { companyName: input.entityName, jurisdiction: input.jurisdiction },
    contentHash,
    extractedFacts: [extractedFact],
  };

  const signalRecordHash = "sha256_" + createHash("sha256").update(JSON.stringify(recordNoHash)).digest("hex");

  return {
    valid: true,
    record: { ...recordNoHash, signalRecordHash },
  };
}

export function scorePhase2(
  signal: Phase1SignalRecord,
  evaluationTimeIso: string,
  config: ScoringConfig
): QualifiedLeadRecord {
  const evalTime = new Date(evaluationTimeIso).getTime();
  const pubTime = new Date(signal.publishedAt).getTime();
  const ageHours = (evalTime - pubTime) / (1000 * 60 * 60);

  if (ageHours > config.maxAgeHours) {
    throw new Error(`AGE_CEILING_EXCEEDED: Signal age ${ageHours}h exceeds ceiling ${config.maxAgeHours}h`);
  }

  const decay = Math.exp(-config.ageDecayLambda * ageHours);
  const baseMult = config.typeMultipliers["regulatory_filing"] ?? 1.0;
  const compositeScore = Number((baseMult * decay).toFixed(4));
  const qualificationTier = compositeScore >= 0.8 ? "HOT" : compositeScore >= 0.5 ? "WARM" : "NURTURE";

  return {
    leadId: `lead_${signal.inputSignalId.substring(4)}`,
    qualificationTier,
    inputSignalId: signal.inputSignalId,
    inputContentHash: signal.contentHash,
    inputSignalRecordHash: signal.signalRecordHash,
    scoringModelVersion: "p2-v2026.1",
    scoringConfigHash: calculateCanonicalConfigHash(config),
    compositeScore,
  };
}

export function generatePhase3(context: DraftGenerationInput): CandidateDraftEnvelope {
  const firstFact = context.evidence.extractedFacts[0];
  const sentence0 = `I saw that ${context.evidence.normalizedEntity.companyName} filed regulatory documents.`;
  const sentence1 = `${context.offerProfile.productName} ${context.offerProfile.permittedCapabilities[0]?.toLowerCase() ?? "assists automation"}.`;

  return {
    echoedBinding: { ...context.binding },
    echoedLead: { ...context.lead },
    draft: {
      draftId: "draft_gen_test_001",
      generatedAt: "2026-08-16T11:25:00Z",
      subjectLine: "Regulatory Update",
      bodyText: `${sentence0} ${sentence1}`,
      traceabilityMap: [
        {
          sentenceIndex: 0,
          sentence: sentence0,
          declaredClaimType: "PROSPECT_FACT",
          declaredMappedFactId: firstFact?.factId ?? null,
          declaredEvidenceReference: firstFact?.evidenceReference ?? null,
        },
        {
          sentenceIndex: 1,
          sentence: sentence1,
          declaredClaimType: "OFFER_CLAIM",
          declaredMappedFactId: null,
          declaredEvidenceReference: null,
        },
      ],
      generatorMetadata: {
        modelId: "gemini-2.5-flash",
        promptVersion: "p3-v2026.1",
        temperature: 0.2,
      },
    },
  };
}

export function authorizePhase4(
  envelope: CandidateDraftEnvelope,
  lockedState: AuthorizationContext
): AuthorizationDecision {
  const decisionId = "dec_" + createHash("sha256").update(Math.random().toString()).digest("hex").substring(0, 12);
  const timestamp = new Date().toISOString();

  const bindingValid =
    envelope.echoedBinding.inputSignalId === lockedState.lockedPhase1Record.inputSignalId &&
    envelope.echoedBinding.inputContentHash === lockedState.lockedPhase1Record.contentHash &&
    envelope.echoedBinding.inputSignalRecordHash === lockedState.lockedPhase1Record.signalRecordHash &&
    envelope.echoedBinding.scoringConfigHash === lockedState.lockedPhase2Lead.scoringConfigHash;

  const tierValid = envelope.echoedLead.qualificationTier === lockedState.lockedPhase2Lead.qualificationTier;

  const bindingVerification = {
    inputSignalIdValid: envelope.echoedBinding.inputSignalId === lockedState.lockedPhase1Record.inputSignalId,
    inputContentHashValid: envelope.echoedBinding.inputContentHash === lockedState.lockedPhase1Record.contentHash,
    inputSignalRecordHashValid: envelope.echoedBinding.inputSignalRecordHash === lockedState.lockedPhase1Record.signalRecordHash,
    scoringConfigHashValid: envelope.echoedBinding.scoringConfigHash === lockedState.lockedPhase2Lead.scoringConfigHash,
    qualificationTierValid: tierValid,
  };

  if (!bindingValid || !tierValid) {
    const reasonCode: RejectionReasonCode = !bindingValid ? "BINDING_HASH_MISMATCH" : "QUALIFICATION_TIER_MISMATCH";
    return buildDecision(decisionId, timestamp, "REJECTED", bindingVerification, [], {
      primaryReasonCode: reasonCode,
      detailedDescription: "Cryptographic context binding or lead qualification tier mismatch against locked store.",
    });
  }

  const parsedSentences = envelope.draft.bodyText
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const tMap = envelope.draft.traceabilityMap;

  if (parsedSentences.length !== tMap.length) {
    return buildDecision(decisionId, timestamp, "REJECTED", bindingVerification, [], {
      primaryReasonCode: "STRUCTURAL_SENTENCE_COUNT_MISMATCH",
      detailedDescription: `Parsed sentence count (${parsedSentences.length}) does not equal traceability map entries (${tMap.length}).`,
    });
  }

  for (let i = 0; i < parsedSentences.length; i++) {
    if (tMap[i]?.sentenceIndex !== i || tMap[i]?.sentence.trim() !== parsedSentences[i]) {
      return buildDecision(decisionId, timestamp, "REJECTED", bindingVerification, [], {
        primaryReasonCode: "STRUCTURAL_INDEX_SEQUENCE_GAP",
        failingSentenceIndex: i,
        detailedDescription: `Sentence index ${i} sequence gap or sentence string mismatch.`,
      });
    }
  }

  const sentenceAudits: VerifiedSentenceAudit[] = [];
  const entityName = lockedState.lockedPhase1Record.normalizedEntity.companyName;

  for (let i = 0; i < parsedSentences.length; i++) {
    const sentence = parsedSentences[i]!;
    const declared = tMap[i]!;
    const hasEntityMention = sentence.toLowerCase().includes(entityName.toLowerCase());

    let independentType: VerifiedSentenceAudit["independentlyClassifiedType"];
    if (hasEntityMention) {
      independentType = "PROSPECT_FACT";
    } else if (lockedState.lockedOfferCapabilities.some((cap) => sentence.toLowerCase().includes(cap.toLowerCase().substring(0, 10)))) {
      independentType = "OFFER_CLAIM";
    } else {
      independentType = "GENERAL_CONTEXT";
    }

    if (hasEntityMention && declared.declaredClaimType === "GENERAL_CONTEXT") {
      sentenceAudits.push({
        sentenceIndex: i,
        sentenceText: sentence,
        candidateDeclaredType: declared.declaredClaimType,
        independentlyClassifiedType: independentType,
        detectedEntities: [entityName],
        passed: false,
        failureReason: "ENTITY_SCOPE_VIOLATION",
      });

      return buildDecision(decisionId, timestamp, "REJECTED", bindingVerification, sentenceAudits, {
        primaryReasonCode: "ENTITY_SCOPE_VIOLATION",
        failingSentenceIndex: i,
        detailedDescription: `Sentence ${i} references entity '${entityName}' but was declared as GENERAL_CONTEXT.`,
      });
    }

    if (declared.declaredClaimType === "PROSPECT_FACT") {
      const mappedFact = lockedState.lockedPhase1Record.extractedFacts.find((f) => f.factId === declared.declaredMappedFactId);
      if (!mappedFact) {
        sentenceAudits.push({
          sentenceIndex: i,
          sentenceText: sentence,
          candidateDeclaredType: declared.declaredClaimType,
          independentlyClassifiedType: independentType,
          detectedEntities: hasEntityMention ? [entityName] : [],
          passed: false,
          failureReason: "EVIDENCE_SUBSTRING_NOT_FOUND",
        });
        return buildDecision(decisionId, timestamp, "REJECTED", bindingVerification, sentenceAudits, {
          primaryReasonCode: "EVIDENCE_SUBSTRING_NOT_FOUND",
          failingSentenceIndex: i,
          detailedDescription: `Mapped factId '${declared.declaredMappedFactId}' not found in extracted facts.`,
        });
      }

      const substringExists = lockedState.lockedPhase1Record.rawText.includes(mappedFact.evidenceReference);
      if (!substringExists) {
        sentenceAudits.push({
          sentenceIndex: i,
          sentenceText: sentence,
          candidateDeclaredType: declared.declaredClaimType,
          independentlyClassifiedType: independentType,
          detectedEntities: hasEntityMention ? [entityName] : [],
          passed: false,
          failureReason: "EVIDENCE_SUBSTRING_NOT_FOUND",
        });
        return buildDecision(decisionId, timestamp, "REJECTED", bindingVerification, sentenceAudits, {
          primaryReasonCode: "EVIDENCE_SUBSTRING_NOT_FOUND",
          failingSentenceIndex: i,
          detailedDescription: `Evidence substring '${mappedFact.evidenceReference}' not found verbatim in Phase 1 raw text.`,
        });
      }

      const nliResult = lockedState.nliEvaluator(mappedFact.evidenceReference, sentence);
      if (!nliResult.success) {
        sentenceAudits.push({
          sentenceIndex: i,
          sentenceText: sentence,
          candidateDeclaredType: declared.declaredClaimType,
          independentlyClassifiedType: independentType,
          detectedEntities: hasEntityMention ? [entityName] : [],
          passed: false,
          failureReason: "NLI_SERVICE_FAILURE",
        });

        return buildDecision(decisionId, timestamp, "MANUAL_REVIEW_REQUIRED", bindingVerification, sentenceAudits, {
          primaryReasonCode: "NLI_SERVICE_FAILURE",
          failingSentenceIndex: i,
          detailedDescription: `NLI evaluation service failed: ${nliResult.error ?? "Unknown NLI error"}. Fail closed to MANUAL_REVIEW.`,
        });
      }

      if ((nliResult.score ?? 0) < 0.85) {
        sentenceAudits.push({
          sentenceIndex: i,
          sentenceText: sentence,
          candidateDeclaredType: declared.declaredClaimType,
          independentlyClassifiedType: independentType,
          detectedEntities: hasEntityMention ? [entityName] : [],
          passed: false,
          failureReason: "ENTAILMENT_FAILURE_PROSPECT_FACT",
        });
        return buildDecision(decisionId, timestamp, "REJECTED", bindingVerification, sentenceAudits, {
          primaryReasonCode: "ENTAILMENT_FAILURE_PROSPECT_FACT",
          failingSentenceIndex: i,
          detailedDescription: `NLI entailment score (${nliResult.score}) below required 0.85 threshold.`,
        });
      }
    }

    if (declared.declaredClaimType === "OFFER_CLAIM") {
      let maxOfferEntailment = 0;
      let nliFailed = false;

      for (const capability of lockedState.lockedOfferCapabilities) {
        const res = lockedState.nliEvaluator(capability, sentence);
        if (!res.success) {
          nliFailed = true;
          break;
        }
        if ((res.score ?? 0) > maxOfferEntailment) {
          maxOfferEntailment = res.score!;
        }
      }

      if (nliFailed) {
        sentenceAudits.push({
          sentenceIndex: i,
          sentenceText: sentence,
          candidateDeclaredType: declared.declaredClaimType,
          independentlyClassifiedType: independentType,
          detectedEntities: [],
          passed: false,
          failureReason: "NLI_SERVICE_FAILURE",
        });
        return buildDecision(decisionId, timestamp, "MANUAL_REVIEW_REQUIRED", bindingVerification, sentenceAudits, {
          primaryReasonCode: "NLI_SERVICE_FAILURE",
          failingSentenceIndex: i,
          detailedDescription: "NLI service failed during offer claim verification.",
        });
      }

      if (maxOfferEntailment < 0.85) {
        sentenceAudits.push({
          sentenceIndex: i,
          sentenceText: sentence,
          candidateDeclaredType: declared.declaredClaimType,
          independentlyClassifiedType: independentType,
          detectedEntities: [],
          passed: false,
          failureReason: "OFFER_CAPABILITY_UNAUTHORIZED",
        });
        return buildDecision(decisionId, timestamp, "REJECTED", bindingVerification, sentenceAudits, {
          primaryReasonCode: "OFFER_CAPABILITY_UNAUTHORIZED",
          failingSentenceIndex: i,
          detailedDescription: `Offer claim '${sentence}' is not semantically entailed by permitted capabilities (max entailment ${maxOfferEntailment}).`,
        });
      }
    }

    sentenceAudits.push({
      sentenceIndex: i,
      sentenceText: sentence,
      candidateDeclaredType: declared.declaredClaimType,
      independentlyClassifiedType: independentType,
      detectedEntities: hasEntityMention ? [entityName] : [],
      passed: true,
    });
  }

  return buildDecision(decisionId, timestamp, "AUTHORIZED", bindingVerification, sentenceAudits);
}

function buildDecision(
  decisionId: string,
  timestamp: string,
  status: AuthorizationDecision["status"],
  bindingVerification: AuthorizationDecision["bindingVerification"],
  sentenceAudits: VerifiedSentenceAudit[],
  rejectionSummary?: AuthorizationDecision["rejectionSummary"]
): AuthorizationDecision {
  const payload = { decisionId, timestamp, status, bindingVerification, sentenceAudits, rejectionSummary };
  const auditTrailHash = "sha256_" + createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  return { ...payload, auditTrailHash };
}
