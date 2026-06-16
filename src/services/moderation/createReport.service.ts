import HttpError from "../../utils/httpError.util.js";
import { clearReportsCache } from "../../utils/clearCache.util.js";

import AiAnswerFeedback from "../../models/aiAnswerFeedback.model.js";
import Answer from "../../models/answer.model.js";
import Question from "../../models/question.model.js";
import Reply from "../../models/reply.model.js";
import Report from "../../models/report.model.js";

type ReportTargetType = "QUESTION" | "ANSWER" | "REPLY" | "AI_ANSWER_FEEDBACK";
type ReportReason =
  | "SPAM"
  | "HARASSMENT"
  | "HATE_SPEECH"
  | "INAPPROPRIATE_CONTENT"
  | "MISINFORMATION"
  | "OTHER";

interface CreateReportInput {
  reportedBy: string;
  targetId: string;
  targetType: ReportTargetType;
  reportReason: ReportReason;
  reportComment?: string;
}

const findTargetContent = async (
  targetId: string,
  targetType: ReportTargetType,
) => {
  switch (targetType) {
    case "QUESTION":
      return Question.findOne({ _id: targetId, isActive: true }, { userId: 1 });

    case "ANSWER":
      return Answer.findOne({ _id: targetId, isActive: true }, { userId: 1 });

    case "REPLY":
      return Reply.findOne({ _id: targetId, isActive: true }, { userId: 1 });

    case "AI_ANSWER_FEEDBACK":
      return AiAnswerFeedback.findOne(
        { _id: targetId, isActive: true },
        { userId: 1 },
      );
  }
};

const createReport = async ({
  reportedBy,
  targetId,
  targetType,
  reportReason,
  reportComment,
}: CreateReportInput) => {
  const foundContent = await findTargetContent(targetId, targetType);

  if (!foundContent) {
    throw new HttpError("Target content not found", 404);
  }

  const report = await Report.create({
    reportedBy,
    targetId,
    targetUserId: foundContent.userId,
    targetType,
    reportReason,
    reportComment,
  });

  await clearReportsCache();

  return { report };
};

export default createReport;
