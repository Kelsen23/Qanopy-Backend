import mongoose from "mongoose";

import Question from "../../models/question.model.js";
import Answer from "../../models/answer.model.js";
import Reply from "../../models/reply.model.js";
import QuestionVersion from "../../models/questionVersion.model.js";
import AiAnswerFeedback from "../../models/aiAnswerFeedback.model.js";

import HttpError from "../../utils/httpError.util.js";
import { clearVersionHistoryCache } from "../../utils/clearCache.util.js";

import { getRedisCacheClient } from "../../config/redis.config.js";

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
  contentType: "QUESTION" | "ANSWER" | "REPLY" | "AI_ANSWER_FEEDBACK",
  moderationStatus: "APPROVED" | "FLAGGED" | "REJECTED",
  version?: number,
) => {
  const moderationUpdatedAt = new Date();
  const session = await mongoose.startSession();

  let effectiveVersion: number | undefined = version;

  try {
    await session.withTransaction(async () => {
      if (contentType === "QUESTION") {
        if (effectiveVersion === undefined) {
          const questionForVersion = await Question.findById(contentId)
            .select("version isActive")
            .session(session);

          if (!questionForVersion) {
            throw new HttpError("Question not found", 404);
          }

          if (!questionForVersion.isActive) {
            throw new HttpError("Question not found", 404);
          }

          effectiveVersion = questionForVersion.version as number;
        }

        const foundQuestionVersion = await QuestionVersion.findOneAndUpdate(
          { questionId: contentId, version: effectiveVersion },
          { moderationStatus, moderationUpdatedAt },
          { new: true, session },
        );

        if (!foundQuestionVersion) {
          throw new HttpError("Question version not found", 404);
        }

        const foundQuestion = await Question.findById(contentId)
          .select("moderationStatus isActive")
          .session(session);

        if (!foundQuestion || !foundQuestion.isActive) {
          throw new HttpError("Question not found", 404);
        }

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

      const model =
        contentType === "ANSWER"
          ? Answer
          : contentType === "REPLY"
            ? Reply
            : AiAnswerFeedback;
      const ContentModel = model as any;

      const foundContent = await ContentModel.findById(contentId)
        .select("moderationStatus isActive")
        .session(session);

      if (!foundContent || !foundContent.isActive) {
        throw new HttpError(`${contentType} not found`, 404);
      }

      if (
        shouldAdvanceModerationStatus(
          foundContent.moderationStatus,
          moderationStatus,
        )
      ) {
        await ContentModel.findByIdAndUpdate(
          contentId,
          {
            moderationStatus,
            moderationUpdatedAt,
          },
          { session },
        );
      }
    });

    if (contentType === "QUESTION" && effectiveVersion !== undefined) {
      await getRedisCacheClient().del(
        `question:${contentId}`,
        `v:${effectiveVersion}:question:${contentId}`,
      );
      await clearVersionHistoryCache(contentId);
    }
  } finally {
    session.endSession();
  }
};

export default applyAiModerationDecisionService;
