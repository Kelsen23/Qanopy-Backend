import { ContentType } from "../../../generated/prisma/index.js";

import { isLowConfidenceHighRiskCategory } from "./aiModeration.policy.js";

type ModerationDecision = "IGNORE" | "WARN" | "BAN_TEMP" | "BAN_PERM";

const moderationContentTypeMap: Record<
  "QUESTION" | "ANSWER" | "REPLY" | "AI_ANSWER_FEEDBACK",
  ContentType
> = {
  QUESTION: ContentType.QUESTION,
  ANSWER: ContentType.ANSWER,
  REPLY: ContentType.REPLY,
  AI_ANSWER_FEEDBACK: ContentType.AI_ANSWER_FEEDBACK,
};

const mapSeverityToDecision = (riskScore: number) => {
  if (riskScore >= 6.0) return "BAN_PERM";
  if (riskScore >= 3.0) return "BAN_TEMP";
  if (riskScore > 0) return "WARN";
  return "IGNORE";
};

const decisionRank: Record<ModerationDecision, number> = {
  IGNORE: 0,
  WARN: 1,
  BAN_TEMP: 2,
  BAN_PERM: 3,
};

const pickStrongerDecision = (a: ModerationDecision, b: ModerationDecision) =>
  decisionRank[a] >= decisionRank[b] ? a : b;

const resolveFinalModerationDecision = ({
  recommendedAction,
  riskDecision,
  primaryCategory,
  confidence,
}: {
  recommendedAction: ModerationDecision;
  riskDecision: ModerationDecision;
  primaryCategory: string | null;
  confidence: number;
}) =>
  isLowConfidenceHighRiskCategory(primaryCategory, confidence)
    ? recommendedAction
    : pickStrongerDecision(recommendedAction, riskDecision);

const buildContentFields = (content: { title?: unknown; body?: unknown }) => {
  const contentTitle = "title" in content ? String(content.title ?? "") : "";
  const contentBody = "body" in content ? String(content.body ?? "") : "";

  return `Title: ${contentTitle}\nBody: ${contentBody}`;
};

type ModeratableContentType =
  | "QUESTION"
  | "ANSWER"
  | "REPLY"
  | "AI_ANSWER_FEEDBACK";

export type { ModeratableContentType, ModerationDecision };

export {
  moderationContentTypeMap,
  mapSeverityToDecision,
  pickStrongerDecision,
  resolveFinalModerationDecision,
  buildContentFields,
};
