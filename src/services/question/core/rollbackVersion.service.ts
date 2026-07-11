import mongoose from "mongoose";

import { getRedisCacheClient } from "../../../config/redis.config.js";

import HttpError from "../../../utils/http/httpError.util.js";
import { clearVersionHistoryCache } from "../../../utils/cache/clearCache.util.js";
import { queueContentPipelineRoute } from "../../../utils/question/pipelineRouting.util.js";

import Question from "../../../models/question.model.js";
import QuestionVersion from "../../../models/questionVersion.model.js";

import { isObjectId } from "../question.shared.js";
import { toPublicQuestionVersion } from "../question.response.js";

const moderationSeverity = {
  PENDING: 0,
  APPROVED: 1,
  FLAGGED: 2,
  REJECTED: 3,
} as const;

type ModerationStatus = keyof typeof moderationSeverity;

const rollbackVersion = async (
  userId: string,
  questionId: string,
  version: number,
) => {
  if (!isObjectId(questionId)) throw new HttpError("Invalid questionId", 400);

  const cachedQuestion = await getRedisCacheClient().get(
    `question:${questionId}`,
  );

  const foundQuestion = cachedQuestion
    ? JSON.parse(cachedQuestion)
    : await Question.findById(questionId).lean();

  if (!foundQuestion) throw new HttpError("Question not found", 404);

  if (foundQuestion.isDeleted || !foundQuestion.isActive)
    throw new HttpError("Question not active", 410);

  if (foundQuestion.userId?.toString() !== userId)
    throw new HttpError("Unauthorized to edit question", 403);

  const authoritativeQuestion = (await Question.findById(questionId)
    .select("_id currentVersion lastRollbackVersion")
    .lean()) as {
    currentVersion: number;
    lastRollbackVersion?: number | null;
  } | null;

  if (!authoritativeQuestion) throw new HttpError("Question not found", 404);

  if (authoritativeQuestion.currentVersion <= version)
    throw new HttpError("Cannot rollback to same or newer version", 400);

  if (Number(authoritativeQuestion.lastRollbackVersion ?? 0) === version)
    throw new HttpError("Cannot rollback to the same version twice", 400);

  const cachedVersion = await getRedisCacheClient().get(
    `v:${version}:question:${questionId}`,
  );

  const foundVersion = cachedVersion
    ? JSON.parse(cachedVersion)
    : await QuestionVersion.findOne({ questionId, version });

  if (!foundVersion) throw new HttpError("Version not found", 404);

  if (foundVersion.isActive)
    throw new HttpError("Could not rollback to active version", 400);
  if (foundVersion.moderationStatus === "REJECTED")
    throw new HttpError("Cannot rollback to a rejected version", 400);

  const session = await mongoose.startSession();

  const { nextVersion, createdNewVersion } = await session.withTransaction(
    async () => {
      const freshQuestion =
        await Question.findById(questionId).session(session);
      if (!freshQuestion) throw new HttpError("Question not found", 404);

      const nextVersion = Number(freshQuestion.currentVersion) + 1;
      const rolledBackVersionIsPending =
        foundVersion.moderationStatus === "PENDING";
      const rolledBackVersionIsWorse =
        moderationSeverity[foundVersion.moderationStatus as ModerationStatus] >=
        moderationSeverity[
          (freshQuestion.moderationStatus as ModerationStatus) ?? "PENDING"
        ];

      await QuestionVersion.updateMany(
        { questionId, isActive: true },
        { $set: { isActive: false } },
        { session },
      );

      await QuestionVersion.updateMany(
        {
          questionId,
          version: { $gt: foundVersion.version },
          isActive: false,
        },
        { $set: { supersededByRollback: true } },
        { session },
      );

      const [createdNewVersion] = await QuestionVersion.create(
        [
          {
            questionId,
            userId: foundVersion.userId,
            version: nextVersion,
            title: foundVersion.title,
            body: foundVersion.body,
            tags: foundVersion.tags,
            basedOnVersion: foundVersion.version,
            isActive: true,
            moderationStatus: foundVersion.moderationStatus,
            moderationUpdatedAt: foundVersion.moderationUpdatedAt ?? null,
          },
        ],
        { session },
      );

      await Question.findByIdAndUpdate(
        questionId,
        {
          title: foundVersion.title,
          body: foundVersion.body,
          tags: foundVersion.tags,
          currentVersion: nextVersion,
          basedOnVersion: foundVersion.version,
          lastRollbackVersion: foundVersion.version,
          moderationStatus: rolledBackVersionIsPending
            ? "PENDING"
            : rolledBackVersionIsWorse
              ? foundVersion.moderationStatus
              : freshQuestion.moderationStatus,
          moderationUpdatedAt: rolledBackVersionIsPending
            ? null
            : rolledBackVersionIsWorse
              ? (foundVersion.moderationUpdatedAt ?? null)
              : (freshQuestion.moderationUpdatedAt ?? null),
          moderationSourceVersion: rolledBackVersionIsPending
            ? nextVersion
            : rolledBackVersionIsWorse
              ? nextVersion
              : Number(freshQuestion.moderationSourceVersion ?? nextVersion),
          topicStatus: "PENDING",
          similarQuestionIds: [],
          similarQuestionsStatus: "NONE",
        },
        { session },
      );

      return { nextVersion, createdNewVersion };
    },
  );

  session.endSession();

  await getRedisCacheClient().del(
    `question:${questionId}`,
    `v:${version}:question:${questionId}`,
    `v:${nextVersion}:question:${questionId}`,
  );

  await clearVersionHistoryCache(questionId);

  await queueContentPipelineRoute({
    contentType: "QUESTION",
    contentId: questionId,
    version: nextVersion,
  });

  return {
    message: "Successfully rolled back",
    newVersion: toPublicQuestionVersion(createdNewVersion),
  };
};

export default rollbackVersion;
