import type { QuestionEligibilityGateResult } from "../../../validations/question.schema.js";

type ProcessQuestionEligibilityGateJobData = {
  questionId: string;
  version: number;
};

type QuestionEligibilityStatus = "ALLOWED" | "CLARIFY" | "REJECTED";

type SecurityVerifierStatus =
  | "NOT_REQUIRED"
  | "PENDING"
  | "PROCESSING"
  | "ALLOWED"
  | "ALLOWED_WITH_CONSTRAINTS"
  | "REJECTED";

const questionEligibilityStatusByDecision: Record<
  QuestionEligibilityGateResult["decision"],
  QuestionEligibilityStatus
> = {
  allow: "ALLOWED",
  clarify: "CLARIFY",
  reject: "REJECTED",
};

const shouldRunSecurityVerifier = (result: QuestionEligibilityGateResult) =>
  result.decision === "allow" &&
  (result.security.hasSuspiciousInstructionalText ||
    result.security.promptInjectionRisk === "low" ||
    result.security.promptInjectionRisk === "medium");

const buildQuestionEligibilityMetadata = (
  result: QuestionEligibilityGateResult,
) => ({
  decision: result.decision,
  eligibleForDownstreamProcessing: result.eligibleForDownstreamProcessing,
  understandabilityStatus: result.understandability.status,
  understandabilityReason: result.understandability.reason,
  isSoftwareRelated: result.softwareValidity.isSoftwareRelated,
  hasRealQuestionOrProblem: result.softwareValidity.hasRealQuestionOrProblem,
  intent: result.softwareValidity.intent,
  technologies: result.softwareValidity.technologies,
  questionableEntities: result.softwareValidity.questionableEntities,
  answerabilityStatus: result.answerability.status,
  missingContext: result.answerability.missingContext,
  promptInjectionRisk: result.security.promptInjectionRisk,
  hasSuspiciousInstructionalText:
    result.security.hasSuspiciousInstructionalText,
  harmfulTechnicalIntent: result.security.harmfulTechnicalIntent,
  securityReason: result.security.reason,
});

export {
  buildQuestionEligibilityMetadata,
  questionEligibilityStatusByDecision,
  shouldRunSecurityVerifier,
};

export type {
  ProcessQuestionEligibilityGateJobData,
  QuestionEligibilityStatus,
  SecurityVerifierStatus,
};
