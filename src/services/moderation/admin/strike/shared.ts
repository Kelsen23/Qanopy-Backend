type AdminStrikeActionTaken = "BAN_TEMP" | "BAN_PERM" | "WARN" | "IGNORE";

type StrikeTargetType = "QUESTION" | "ANSWER" | "REPLY" | "AI_ANSWER_FEEDBACK";

type StrikeModerationContext = {
  strikeId: string;
  targetUserId: string;
  targetContentId: string;
  targetType: StrikeTargetType;
  targetContentVersion: number | null;
  reviewedBy: string;
  reviewComment?: string;
  actionTaken: AdminStrikeActionTaken;
  title: string;
  reasons: string[];
  decisionId: string;
  claimToken: string;
  originalAiDecision: string | null;
  originalAiConfidence: number | null;
  originalAiReasons: string[];
  severity: number | null;
  riskScore: number | null;
};

type TargetContentState = {
  exists: boolean;
  isActive: boolean;
  isDeleted: boolean;
  ownerMatches: boolean;
  canRemove: boolean;
};

type StrikeSideEffectContext = {
  decisionId: string;
  strikeId: string;
  actionTaken: AdminStrikeActionTaken;
  targetUserId: string;
};

type StrikeModerationBaseMeta = {
  title: string;
  reasons: string[];
  reviewComment?: string;
  originalAiDecision: string | null;
  originalAiConfidence: number | null;
  originalAiReasons: string[];
  severity: number | null;
  riskScore: number | null;
  targetContentId: string;
  targetType: StrikeTargetType;
  targetContentVersion: number | null;
};

const actionToModerationStatus: Record<
  AdminStrikeActionTaken,
  "APPROVED" | "FLAGGED" | "REJECTED"
> = {
  BAN_TEMP: "REJECTED",
  BAN_PERM: "REJECTED",
  WARN: "FLAGGED",
  IGNORE: "APPROVED",
};

const buildStrikeModerationBaseMeta = (context: StrikeModerationContext) => ({
  title: context.title,
  reasons: context.reasons,
  reviewComment: context.reviewComment,
  originalAiDecision: context.originalAiDecision,
  originalAiConfidence: context.originalAiConfidence,
  originalAiReasons: context.originalAiReasons,
  severity: context.severity,
  riskScore: context.riskScore,
  targetContentId: context.targetContentId,
  targetType: context.targetType,
  targetContentVersion: context.targetContentVersion,
});

export type {
  AdminStrikeActionTaken,
  StrikeTargetType,
  StrikeModerationContext,
  TargetContentState,
  StrikeSideEffectContext,
  StrikeModerationBaseMeta,
};

export { actionToModerationStatus, buildStrikeModerationBaseMeta };
