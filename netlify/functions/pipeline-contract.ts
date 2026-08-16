import { createHash } from "node:crypto";
import { z } from "zod";

// ============================================================================
// PHASE 1 CONTRACTS
// ============================================================================

export const RawSignalInputSchema = z.object({
  sourceUrl: z.string().url(),
  publishedAt: z.string().datetime(),
  rawText: z.string().min(1),
  entityName: z.string().min(1),
  jurisdiction: z.string().optional(),
});
export type RawSignalInput = z.infer<typeof RawSignalInputSchema>;

export interface Phase1SignalRecord {
  inputSignalId: string;
  sourceUrl: string;
  publishedAt: string;
  rawText: string;
  normalizedEntity: {
    companyName: string;
    jurisdiction?: string;
  };
  contentHash: string; // "sha256_..."
  signalRecordHash: string; // "sha256_..."
  extractedFacts: Array<{
    factId: string;
    factType: "regulatory_filing" | "personnel_change" | "scale_metric" | "technology_adoption";
    subject: string;
    roleOrEvent: string;
    isDirectFact: boolean;
    evidenceReference: string;
  }>;
}

export interface Phase1ValidationResult {
  valid: boolean;
  record?: Phase1SignalRecord;
  error?: string;
}

// ============================================================================
// PHASE 2 CONTRACTS
// ============================================================================

export interface ScoringConfig {
  configVersion: string;
  ageDecayLambda: number;
  maxAgeHours: number;
  typeMultipliers: Record<string, number>;
}

export interface QualifiedLeadRecord {
  leadId: string;
  qualificationTier: "HOT" | "WARM" | "NURTURE";
  inputSignalId: string;
  inputContentHash: string;
  inputSignalRecordHash: string;
  scoringModelVersion: string;
  scoringConfigHash: string;
  compositeScore: number;
}

// ============================================================================
// PHASE 3 CONTRACTS
// ============================================================================

export interface GenerationContextBinding {
  inputSignalId: string;
  inputContentHash: string;
  inputSignalRecordHash: string;
  scoringModelVersion: string;
  scoringConfigHash: string;
}

export interface DraftGenerationInput {
  binding: GenerationContextBinding;
  lead: {
    leadId: string;
    qualificationTier: "HOT" | "WARM" | "NURTURE";
  };
  evidence: {
    normalizedEntity: {
      companyName: string;
      jurisdiction?: string;
    };
    relevantExcerpt: string;
    extractedFacts: Phase1SignalRecord["extractedFacts"];
  };
  offerProfile: {
    offerId: string;
    productName: string;
    valueProposition: string;
    permittedCapabilities: string[];
  };
  generationPolicy: {
    permittedClaimTypes: Array<"PROSPECT_FACT" | "PROSPECT_INTERPRETATION" | "OFFER_CLAIM" | "GENERAL_CONTEXT">;
    maxSentenceCount: number;
    channel: "email";
  };
}

export interface UntrustedTraceabilityDeclaration {
  sentenceIndex: number;
  sentence: string;
  declaredClaimType: "PROSPECT_FACT" | "PROSPECT_INTERPRETATION" | "OFFER_CLAIM" | "GENERAL_CONTEXT";
  declaredMappedFactId: string | null;
  declaredEvidenceReference: string | null;
}

export interface CandidateDraft {
  draftId: string;
  generatedAt: string;
  subjectLine?: string;
  bodyText: string;
  traceabilityMap: UntrustedTraceabilityDeclaration[];
  generatorMetadata: {
    modelId: string;
    promptVersion: string;
    temperature: number;
  };
}

export interface CandidateDraftEnvelope {
  echoedBinding: GenerationContextBinding;
  echoedLead: {
    leadId: string;
    qualificationTier: "HOT" | "WARM" | "NURTURE";
  };
  draft: CandidateDraft;
}

// ============================================================================
// PHASE 4 CONTRACTS
// ============================================================================

export type AuthorizationStatus = "AUTHORIZED" | "MANUAL_REVIEW_REQUIRED" | "REJECTED";

export type RejectionReasonCode =
  | "BINDING_HASH_MISMATCH"
  | "QUALIFICATION_TIER_MISMATCH"
  | "STRUCTURAL_SENTENCE_COUNT_MISMATCH"
  | "STRUCTURAL_INDEX_SEQUENCE_GAP"
  | "ENTITY_SCOPE_VIOLATION"
  | "EVIDENCE_SUBSTRING_NOT_FOUND"
  | "ENTAILMENT_FAILURE_PROSPECT_FACT"
  | "OFFER_CAPABILITY_UNAUTHORIZED"
  | "NLI_SERVICE_FAILURE";

export interface VerifiedSentenceAudit {
  sentenceIndex: number;
  sentenceText: string;
  candidateDeclaredType: string;
  independentlyClassifiedType: "PROSPECT_FACT" | "PROSPECT_INTERPRETATION" | "OFFER_CLAIM" | "GENERAL_CONTEXT";
  detectedEntities: string[];
  passed: boolean;
  failureReason?: RejectionReasonCode;
}

export interface AuthorizationDecision {
  decisionId: string;
  timestamp: string;
  status: AuthorizationStatus;
  bindingVerification: {
    inputSignalIdValid: boolean;
    inputContentHashValid: boolean;
    inputSignalRecordHashValid: boolean;
    scoringConfigHashValid: boolean;
    qualificationTierValid: boolean;
  };
  sentenceAudits: VerifiedSentenceAudit[];
  rejectionSummary?: {
    primaryReasonCode: RejectionReasonCode;
    failingSentenceIndex?: number;
    detailedDescription: string;
  };
  auditTrailHash: string;
}

export interface AuthorizationContext {
  lockedPhase1Record: Phase1SignalRecord;
  lockedPhase2Lead: QualifiedLeadRecord;
  lockedOfferCapabilities: string[];
  nliEvaluator: (premise: string, hypothesis: string) => { success: boolean; score?: number; error?: string };
}

// Canonical hash helpers
export function calculateCanonicalContentHash(sourceUrl: string, publishedAt: string, rawText: string): string {
  const canonicalInput = `${sourceUrl}|${publishedAt}|${rawText}`;
  return "sha256_" + createHash("sha256").update(Buffer.from(canonicalInput, "utf8")).digest("hex");
}

export function calculateCanonicalConfigHash(config: ScoringConfig): string {
  const canonicalStr = JSON.stringify(config, Object.keys(config).sort());
  return "sha256_" + createHash("sha256").update(canonicalStr).digest("hex");
}
