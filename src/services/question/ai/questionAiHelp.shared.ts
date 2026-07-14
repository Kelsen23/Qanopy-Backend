type SecurityVerifierStatus =
  | "NOT_REQUIRED"
  | "PENDING"
  | "PROCESSING"
  | "ALLOWED"
  | "ALLOWED_WITH_CONSTRAINTS"
  | "REJECTED";

const completedSecurityVerifierStatuses = new Set<SecurityVerifierStatus>([
  "NOT_REQUIRED",
  "ALLOWED",
  "ALLOWED_WITH_CONSTRAINTS",
]);

const canGetAIHelp = ({
  questionEligibilityStatus,
  securityVerifierStatus,
}: Record<string, any>) =>
  questionEligibilityStatus === "ALLOWED" &&
  completedSecurityVerifierStatuses.has(
    securityVerifierStatus as SecurityVerifierStatus,
  );

const canGenerateAIHelp = ({
  questionEligibilityStatus,
  securityVerifierStatus,
  embeddingStatus,
}: Record<string, any>) =>
  canGetAIHelp({ questionEligibilityStatus, securityVerifierStatus }) &&
  embeddingStatus === "READY";

export { canGenerateAIHelp, canGetAIHelp };
