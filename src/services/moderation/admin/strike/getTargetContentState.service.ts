import Question from "../../../../models/question.model.js";
import Answer from "../../../../models/answer.model.js";
import Reply from "../../../../models/reply.model.js";
import AiAnswerFeedback from "../../../../models/aiAnswerFeedback.model.js";

import type { StrikeTargetType, TargetContentState } from "./shared.js";

const contentModelMap = {
  QUESTION: Question,
  ANSWER: Answer,
  REPLY: Reply,
  AI_ANSWER_FEEDBACK: AiAnswerFeedback,
} as const;

const getTargetContentState = async (
  targetType: StrikeTargetType,
  targetContentId: string,
  targetUserId: string,
): Promise<TargetContentState> => {
  const Model = contentModelMap[targetType] as any;
  const foundContent = await Model.findById(targetContentId)
    .select("userId isActive isDeleted")
    .lean();

  if (!foundContent) {
    return {
      exists: false,
      isActive: false,
      isDeleted: false,
      ownerMatches: false,
      canRemove: false,
    };
  }

  const ownerMatches = String(foundContent.userId ?? "") === targetUserId;
  const isActive = Boolean(foundContent.isActive);
  const isDeleted = Boolean(foundContent.isDeleted);
  const canRemove = ownerMatches && isActive && !isDeleted;

  return {
    exists: true,
    isActive,
    isDeleted,
    ownerMatches,
    canRemove,
  };
};

export default getTargetContentState;
