import type { QuestionEligibilityGateResult } from "../../../validations/question.schema.js";
import type {
  QuestionEligibilityStatus,
  SecurityVerifierStatus,
} from "./questionEligibilityGate.shared.js";

type QuestionGatewayAuditStage =
  | "QUESTION_ELIGIBILITY_GATE"
  | "SECURITY_VERIFIER";

type QuestionGatewayAuditDecision =
  | "ALLOW"
  | "CLARIFY"
  | "REJECT"
  | "ALLOW_WITH_CONSTRAINTS";

type QueueQuestionGatewayAuditInput = {
  decisionId: string;
  questionId: string;
  version: number;
  userId: string;
  stage: QuestionGatewayAuditStage;
  decision: QuestionGatewayAuditDecision;
  questionEligibilityStatus: QuestionEligibilityStatus;
  securityVerifierStatus: SecurityVerifierStatus;
  eligibleForDownstreamProcessing: boolean;
  userFacingReason: string;
  internalReason: string;
  metadata: Record<string, unknown>;
};

const questionGatewayAuditDecisionByGateDecision: Record<
  QuestionEligibilityGateResult["decision"],
  QuestionGatewayAuditDecision
> = {
  allow: "ALLOW",
  clarify: "CLARIFY",
  reject: "REJECT",
};

export { questionGatewayAuditDecisionByGateDecision };

export type {
  QueueQuestionGatewayAuditInput,
  QuestionGatewayAuditDecision,
  QuestionGatewayAuditStage,
};
