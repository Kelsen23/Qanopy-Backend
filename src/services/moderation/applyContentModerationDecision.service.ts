import mongoose from "mongoose";

import { syncQuestionModerationStatusFromVersions } from "./questionModerationStatus.service.js";

import clearModeratedContentCache from "../../utils/moderation/clearModeratedContentCache.util.js";

import Question from "../../models/question.model.js";
import Answer from "../../models/answer.model.js";
import Reply from "../../models/reply.model.js";
import QuestionVersion from "../../models/questionVersion.model.js";
import AiAnswerFeedback from "../../models/aiAnswerFeedback.model.js";

type AiModerationDecisionResult = {
  applied: boolean;
  reason?: "already_moderated" | "revision_changed" | "missing";
};

const applyContentModerationDecisionService = async (
  contentId: string,
  contentType: "QUESTION" | "ANSWER" | "REPLY" | "AI_ANSWER_FEEDBACK",
  moderationStatus: "APPROVED" | "FLAGGED" | "REJECTED",
  versionOrRevision?: number,
): Promise<AiModerationDecisionResult> => {
  const moderationUpdatedAt = new Date();
  const session = await mongoose.startSession();

  let effectiveQuestionVersion: number | undefined =
    contentType === "QUESTION" ? versionOrRevision : undefined;

  try {
    const result = await session.withTransaction(async () => {
      if (contentType === "QUESTION") {
        if (effectiveQuestionVersion === undefined) {
          const questionForVersion = await Question.findById(contentId)
            .select("currentVersion isActive")
            .session(session);

          if (!questionForVersion || !questionForVersion.isActive) {
            return { applied: false, reason: "missing" } as const;
          }

          effectiveQuestionVersion =
            questionForVersion.currentVersion as number;
        }

        const foundQuestionVersion = await QuestionVersion.findOne({
          questionId: contentId,
          version: effectiveQuestionVersion,
          moderationStatus: "PENDING",
        })
          .select("_id")
          .session(session)
          .lean();

        if (!foundQuestionVersion) {
          const existingQuestionVersion = await QuestionVersion.findOne({
            questionId: contentId,
            version: effectiveQuestionVersion,
          })
            .select("_id")
            .session(session)
            .lean();

          if (!existingQuestionVersion) {
            return { applied: false, reason: "missing" } as const;
          }

          return { applied: false, reason: "already_moderated" } as const;
        }

        const currentQuestion = await Question.findById(contentId)
          .select("isActive")
          .session(session)
          .lean();

        if (!currentQuestion || !currentQuestion.isActive) {
          return { applied: false, reason: "missing" } as const;
        }

        const updatedQuestionVersion = await QuestionVersion.findOneAndUpdate(
          {
            questionId: contentId,
            version: effectiveQuestionVersion,
            moderationStatus: "PENDING",
          },
          { moderationStatus, moderationUpdatedAt },
          { returnDocument: "after", session },
        );

        if (!updatedQuestionVersion) {
          const existingQuestionVersion = await QuestionVersion.findOne({
            questionId: contentId,
            version: effectiveQuestionVersion,
          })
            .select("_id")
            .session(session)
            .lean();

          if (!existingQuestionVersion) {
            return { applied: false, reason: "missing" } as const;
          }

          return { applied: false, reason: "already_moderated" } as const;
        }

        await syncQuestionModerationStatusFromVersions({
          questionId: contentId,
          moderationUpdatedAt,
          session,
        });

        return { applied: true } as const;
      }

      const moderationRevision = versionOrRevision;
      const model =
        contentType === "ANSWER"
          ? Answer
          : contentType === "REPLY"
            ? Reply
            : AiAnswerFeedback;
      const ContentModel = model as any;

      const updatedContent = await ContentModel.findOneAndUpdate(
        {
          _id: contentId,
          moderationStatus: "PENDING",
          moderationRevision,
          isActive: true,
        },
        {
          moderationStatus,
          moderationUpdatedAt,
        },
        { returnDocument: "after", session },
      );

      if (!updatedContent) {
        const foundContent = await ContentModel.findById(contentId)
          .select("moderationStatus moderationRevision isActive")
          .session(session)
          .lean();

        if (!foundContent || !foundContent.isActive) {
          return { applied: false, reason: "missing" } as const;
        }

        if (foundContent.moderationRevision !== moderationRevision) {
          return { applied: false, reason: "revision_changed" } as const;
        }

        return { applied: false, reason: "already_moderated" } as const;
      }

      return { applied: true } as const;
    });

    if (result?.applied) {
      await clearModeratedContentCache(
        contentType,
        contentId,
        effectiveQuestionVersion,
      );
    }

    return result ?? { applied: false, reason: "missing" };
  } finally {
    session.endSession();
  }
};

export type { AiModerationDecisionResult };

export default applyContentModerationDecisionService;
