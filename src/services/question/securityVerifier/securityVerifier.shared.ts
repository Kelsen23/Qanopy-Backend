import type { SecurityVerifierResult } from "../../../validations/question.schema.js";
import type { SecurityVerifierStatus } from "../questionEligibilityGate/questionEligibilityGate.shared.js";
import type { QuestionGatewayAuditDecision } from "../questionEligibilityGate/questionGatewayAudit.shared.js";

type ProcessSecurityVerifierJobData = {
  questionId: string;
  version: number;
};

const securityVerifierStatusByDecision: Record<
  SecurityVerifierResult["finalSecurityDecision"],
  Extract<
    SecurityVerifierStatus,
    "ALLOWED" | "ALLOWED_WITH_CONSTRAINTS" | "REJECTED"
  >
> = {
  allow: "ALLOWED",
  allow_with_constraints: "ALLOWED_WITH_CONSTRAINTS",
  reject: "REJECTED",
};

const questionGatewayAuditDecisionBySecurityDecision: Record<
  SecurityVerifierResult["finalSecurityDecision"],
  QuestionGatewayAuditDecision
> = {
  allow: "ALLOW",
  allow_with_constraints: "ALLOW_WITH_CONSTRAINTS",
  reject: "REJECT",
};

const buildSecurityVerifierMetadata = (
  result: SecurityVerifierResult,
  syntheticFailClosed: boolean,
) => ({
  finalSecurityDecision: result.finalSecurityDecision,
  eligibleForDownstreamProcessing:
    result.downstreamPolicy.eligibleForDownstreamProcessing,
  requireDefensiveFraming: result.downstreamPolicy.requireDefensiveFraming,
  requireQuotedTextIsolation:
    result.downstreamPolicy.requireQuotedTextIsolation,
  promptInjectionDetected: result.promptInjection.detected,
  promptInjectionRisk: result.promptInjection.risk,
  promptInjectionAttackType: result.promptInjection.attackType,
  promptInjectionSuspiciousText: result.promptInjection.suspiciousText,
  harmfulTechnicalIntentDetected: result.harmfulTechnicalIntent.detected,
  harmfulTechnicalIntentCategory: result.harmfulTechnicalIntent.category,
  harmfulTechnicalIntentSeverity: result.harmfulTechnicalIntent.severity,
  syntheticFailClosed,
});

const buildFailClosedSecurityVerifierResult = (
  error: unknown,
): SecurityVerifierResult => {
  const message = error instanceof Error ? error.message : "Unknown error";

  return {
    finalSecurityDecision: "reject",
    promptInjection: {
      detected: true,
      risk: "high",
      attackType: "other",
      suspiciousText: [],
    },
    harmfulTechnicalIntent: {
      detected: false,
      category: "none",
      severity: "none",
    },
    downstreamPolicy: {
      eligibleForDownstreamProcessing: false,
      requireDefensiveFraming: false,
      requireQuotedTextIsolation: false,
    },
    userFacingReason:
      "This question could not be safely verified for downstream AI processing.",
    internalReason: `Security verifier failed closed: ${message}`,
  };
};

export {
  buildFailClosedSecurityVerifierResult,
  buildSecurityVerifierMetadata,
  questionGatewayAuditDecisionBySecurityDecision,
  securityVerifierStatusByDecision,
};

export type { ProcessSecurityVerifierJobData };
