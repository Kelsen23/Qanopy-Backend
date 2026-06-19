import Answer from "../../../models/answer.model.js";
import AiAnswerFeedback from "../../../models/aiAnswerFeedback.model.js";
import Question from "../../../models/question.model.js";
import QuestionVersion from "../../../models/questionVersion.model.js";
import Reply from "../../../models/reply.model.js";

import { type ModeratableContentType } from "./contentModeration.shared.js";

const isAiModerationTargetStillPending = async (
  contentId: string,
  contentType: ModeratableContentType,
  versionOrRevision?: number,
) => {
  if (contentType === "QUESTION") {
    const foundQuestionVersion = await QuestionVersion.findOne({
      questionId: contentId,
      version: versionOrRevision,
      moderationStatus: "PENDING",
    })
      .select("_id")
      .lean();

    if (!foundQuestionVersion) return false;

    const foundQuestion = await Question.findOne({
      _id: contentId,
      isActive: true,
    })
      .select("_id")
      .lean();

    return Boolean(foundQuestion);
  }

  const content =
    contentType === "ANSWER"
      ? await Answer.findOne({
          _id: contentId,
          moderationStatus: "PENDING",
          moderationRevision: versionOrRevision,
          isActive: true,
        })
          .select("_id")
          .lean()
      : contentType === "REPLY"
        ? await Reply.findOne({
            _id: contentId,
            moderationStatus: "PENDING",
            moderationRevision: versionOrRevision,
            isActive: true,
          })
            .select("_id")
            .lean()
        : await AiAnswerFeedback.findOne({
            _id: contentId,
            moderationStatus: "PENDING",
            moderationRevision: versionOrRevision,
            isActive: true,
          })
            .select("_id")
            .lean();

  return Boolean(content);
};

export default isAiModerationTargetStillPending;
