import type { QuestionEligibilityGateResult } from "../../../validations/question.schema.js";
import type {
  QuestionEligibilityStatus,
  SecurityVerifierPendingStatus,
} from "../questionEligibilityGate/questionEligibilityGate.shared.js";

type QuestionGatewayAuditDecision = "ALLOW" | "CLARIFY" | "REJECT";

type QueueQuestionGatewayAuditInput = {
  decisionId: string;
  questionId: string;
  version: number;
  userId: string;
  decision: QuestionGatewayAuditDecision;
  questionEligibilityStatus: QuestionEligibilityStatus;
  securityVerifierStatus: SecurityVerifierPendingStatus;
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

export type { QueueQuestionGatewayAuditInput, QuestionGatewayAuditDecision };
