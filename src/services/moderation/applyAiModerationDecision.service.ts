import Question from "../../models/question.model.js";
import Answer from "../../models/answer.model.js";
import Reply from "../../models/reply.model.js";
import QuestionVersion from "../../models/questionVersion.model.js";

import HttpError from "../../utils/httpError.util.js";
import mongoose from "mongoose";

const MODERATION_STATUS_ORDER = {
  PENDING: 0,
  APPROVED: 1,
  FLAGGED: 2,
  REJECTED: 3,
} as const;

type ModerationStatus = keyof typeof MODERATION_STATUS_ORDER;

const shouldAdvanceModerationStatus = (
  currentStatus: unknown,
  nextStatus: Exclude<ModerationStatus, "PENDING">,
) => {
  if (
    typeof currentStatus !== "string" ||
    !(currentStatus in MODERATION_STATUS_ORDER)
  ) {
    return false;
  }

  return (
    MODERATION_STATUS_ORDER[currentStatus as ModerationStatus] <
    MODERATION_STATUS_ORDER[nextStatus]
  );
};

const applyAiModerationDecisionService = async (
  contentId: string,
  contentType: "Question" | "Answer" | "Reply",
  moderationStatus: "APPROVED" | "FLAGGED" | "REJECTED",
  version?: number,
) => {
  const moderationUpdatedAt = new Date();
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      if (contentType === "Question") {
        if (version === undefined)
          throw new HttpError("Version required for Question moderation", 400);

        const foundQuestionVersion = await QuestionVersion.findOneAndUpdate(
          { questionId: contentId, version },
          { moderationStatus, moderationUpdatedAt },
          { new: true, session },
        );

        if (!foundQuestionVersion)
          throw new HttpError("Question version not found", 404);

        const foundQuestion = await Question.findById(contentId)
          .select("moderationStatus isActive")
          .session(session);

        if (!foundQuestion || !foundQuestion.isActive)
          throw new HttpError("Question not found", 404);

        if (
          shouldAdvanceModerationStatus(
            foundQuestion.moderationStatus,
            moderationStatus,
          )
        ) {
          await Question.findByIdAndUpdate(
            contentId,
            {
              moderationStatus,
              moderationUpdatedAt,
            },
            { session },
          );
        }

        return;
      }

      const model = contentType === "Answer" ? Answer : Reply;

      const foundContent = await model
        .findById(contentId)
        .select("moderationStatus isActive")
        .session(session);

      if (!foundContent || !foundContent.isActive)
        throw new HttpError(`${contentType} not found`, 404);

      if (
        shouldAdvanceModerationStatus(
          foundContent.moderationStatus,
          moderationStatus,
        )
      ) {
        await model.findByIdAndUpdate(
          contentId,
          {
            moderationStatus,
            moderationUpdatedAt,
          },
          { session },
        );
      }
    });
  } finally {
    session.endSession();
  }
};

export default applyAiModerationDecisionService;
