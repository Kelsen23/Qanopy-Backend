type SimilarQuestionsStatus =
  | "NOT_STARTED"
  | "PENDING"
  | "PROCESSING"
  | "READY";
type EmbeddingStatus = "NOT_STARTED" | "PENDING" | "PROCESSING" | "READY";
type QuestionEligibilityStatus =
  | "PENDING"
  | "PROCESSING"
  | "ALLOWED"
  | "CLARIFY"
  | "REJECTED";
type SecurityVerifierStatus =
  | "NOT_REQUIRED"
  | "PENDING"
  | "PROCESSING"
  | "ALLOWED"
  | "ALLOWED_WITH_CONSTRAINTS"
  | "REJECTED";
type ModerationStatus = "PENDING" | "APPROVED" | "FLAGGED" | "REJECTED";

type QuestionReadinessInput = {
  questionEligibilityStatus?: unknown;
  securityVerifierStatus?: unknown;
  embeddingStatus?: unknown;
  questionVersion?: number;
  similarQuestionsStatus?: unknown;
  similarQuestionsComputedVersion?: number | null;
};

type QuestionProcessingStateSet = Partial<{
  questionVersion: number;
  similarQuestionsStatus: SimilarQuestionsStatus;
  similarQuestionsComputedAt: Date | null;
  similarQuestionsComputedVersion: number | null;
  embeddingStatus: EmbeddingStatus;
  questionEligibilityStatus: QuestionEligibilityStatus;
  questionEligibilityUpdatedAt: Date | null;
  questionEligibilitySourceVersion: number;
  securityVerifierStatus: SecurityVerifierStatus;
  securityVerifierUpdatedAt: Date | null;
  securityVerifierSourceVersion: number;
  moderationStatus: ModerationStatus;
  moderationUpdatedAt: Date | null;
  moderationSourceVersion: number;
}>;

export type {
  EmbeddingStatus,
  ModerationStatus,
  QuestionEligibilityStatus,
  QuestionProcessingStateSet,
  QuestionReadinessInput,
  SecurityVerifierStatus,
  SimilarQuestionsStatus,
};
