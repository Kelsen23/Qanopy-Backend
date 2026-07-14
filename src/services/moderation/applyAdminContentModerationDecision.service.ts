import mongoose from "mongoose";

import { syncQuestionModerationStatusFromVersions } from "./questionModerationStatus.service.js";
import { queueContentPipelineRoute } from "../question/pipelineRouter/pipelineRouting.service.js";

import { getContentTypeLabel } from "../../utils/content/contentTypeLabel.util.js";
import HttpError from "../../utils/http/httpError.util.js";
import clearModeratedContentCache from "../../utils/moderation/clearModeratedContentCache.util.js";

import Question from "../../models/question.model.js";
import Answer from "../../models/answer.model.js";
import Reply from "../../models/reply.model.js";
import QuestionVersion from "../../models/questionVersion.model.js";
import AiAnswerFeedback from "../../models/aiAnswerFeedback.model.js";

const applyAdminContentModerationDecisionService = async (
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
        const questionForVersion = await Question.findById(contentId)
          .select("currentVersion isActive")
          .session(session);

        if (!questionForVersion || !questionForVersion.isActive) {
          throw new HttpError("Question not found", 404);
        }

        if (effectiveVersion === undefined) {
          effectiveVersion = questionForVersion.currentVersion as number;
        }

        const existingQuestionVersion = await QuestionVersion.findOne({
          questionId: contentId,
          version: effectiveVersion,
        })
          .select("_id")
          .session(session);

        if (!existingQuestionVersion) {
          throw new HttpError("Question version not found", 404);
        }

        const updatedQuestionVersion = await QuestionVersion.findOneAndUpdate(
          { questionId: contentId, version: effectiveVersion },
          { moderationStatus, moderationUpdatedAt },
          { returnDocument: "after", session },
        );

        if (!updatedQuestionVersion) {
          throw new HttpError("Question version not found", 404);
        }

        await syncQuestionModerationStatusFromVersions({
          questionId: contentId,
          moderationUpdatedAt,
          session,
        });

        return;
      }

      const model =
        contentType === "ANSWER"
          ? Answer
          : contentType === "REPLY"
            ? Reply
            : AiAnswerFeedback;
      const ContentModel = model as any;

      const existingContent = await ContentModel.findById(contentId)
        .select("moderationStatus moderationRevision isActive")
        .session(session);

      if (!existingContent || !existingContent.isActive) {
        throw new HttpError(
          `${getContentTypeLabel(contentType)} not found`,
          404,
        );
      }

      if (effectiveVersion === undefined) {
        effectiveVersion = existingContent.moderationRevision as number;
      }

      const updatedContent = await ContentModel.findOneAndUpdate(
        {
          _id: contentId,
          moderationRevision: effectiveVersion,
          isActive: true,
        },
        { moderationStatus, moderationUpdatedAt },
        { returnDocument: "after", session },
      );

      if (!updatedContent || !updatedContent.isActive) {
        throw new HttpError(
          `${getContentTypeLabel(contentType)} not found`,
          404,
        );
      }
    });

    if (effectiveVersion !== undefined || contentType !== "QUESTION") {
      await clearModeratedContentCache(
        contentType,
        contentId,
        effectiveVersion,
      );
    }

    if (contentType === "QUESTION" && effectiveVersion !== undefined) {
      await queueContentPipelineRoute({
        contentType: "QUESTION",
        contentId,
        version: effectiveVersion,
      });
    }
  } finally {
    session.endSession();
  }
};

export default applyAdminContentModerationDecisionService;
