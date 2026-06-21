import HttpError from "../../../utils/http/httpError.util.js";

import Question from "../../../models/question.model.js";
import QuestionVersion from "../../../models/questionVersion.model.js";
import Answer from "../../../models/answer.model.js";
import Reply from "../../../models/reply.model.js";
import AiAnswerFeedback from "../../../models/aiAnswerFeedback.model.js";

type AdminModerationTargetType =
  | "QUESTION"
  | "ANSWER"
  | "REPLY"
  | "AI_ANSWER_FEEDBACK";

const contentModelMap = {
  QUESTION: Question,
  ANSWER: Answer,
  REPLY: Reply,
  AI_ANSWER_FEEDBACK: AiAnswerFeedback,
} as const;

const assertAdminModerationTargetReady = async ({
  targetType,
  targetId,
  targetContentVersion,
}: {
  targetType: AdminModerationTargetType;
  targetId: string;
  targetContentVersion?: number | null;
}) => {
  const Model = contentModelMap[targetType] as any;

  const foundContent = await Model.findById(targetId)
    .select("currentVersion isActive")
    .lean();

  if (!foundContent || !foundContent.isActive) {
    throw new HttpError(`${targetType.toLowerCase()} not found`, 404);
  }

  if (targetType !== "QUESTION") {
    return;
  }

  const versionToCheck = Number(
    targetContentVersion ?? foundContent.currentVersion ?? 1,
  );

  const foundVersion = await QuestionVersion.findOne({
    questionId: targetId,
    version: versionToCheck,
  })
    .select("_id")
    .lean();

  if (!foundVersion) {
    throw new HttpError("Question version not found", 404);
  }
};

export default assertAdminModerationTargetReady;
