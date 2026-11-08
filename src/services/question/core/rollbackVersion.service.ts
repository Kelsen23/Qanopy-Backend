import mongoose from "mongoose";

import { queueContentPipelineRoute } from "../pipelineRouter/pipelineRouting.service.js";
import { updateQuestionProcessingState } from "../processingState/questionProcessingState.service.js";
import { toPublicQuestionVersion } from "../question.response.js";

import { getRedisCacheClient } from "../../../config/redis.config.js";

import HttpError from "../../../utils/http/httpError.util.js";
import {
  clearQuestionDiscoveryCache,
  clearVersionHistoryCache,
} from "../../../utils/cache/clearCache.util.js";

import Question from "../../../models/question.model.js";
import QuestionVersion from "../../../models/questionVersion.model.js";
import QuestionProcessingState from "../../../models/questionProcessingState.model.js";

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

  let transactionResult;
  try {
    transactionResult = await session.withTransaction(async () => {
      const freshQuestion =
        await Question.findById(questionId).session(session);
      if (!freshQuestion) throw new HttpError("Question not found", 404);

      const freshProcessingState = await QuestionProcessingState.findOne({
        questionId,
        questionVersion: Number(freshQuestion.currentVersion),
      }).session(session);
      if (!freshProcessingState) {
        throw new Error("Question processing state missing or stale");
      }

      const nextVersion = Number(freshQuestion.currentVersion) + 1;
      const rolledBackVersionIsPending =
        foundVersion.moderationStatus === "PENDING";
      const rolledBackVersionIsWorse =
        moderationSeverity[foundVersion.moderationStatus as ModerationStatus] >=
        moderationSeverity[
          (freshProcessingState.moderationStatus as ModerationStatus) ??
            "PENDING"
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
        },
        { session },
      );

      const processingStateUpdate = await updateQuestionProcessingState({
        questionId,
        questionVersion: Number(freshQuestion.currentVersion),
        set: {
          questionVersion: nextVersion,
          moderationStatus: rolledBackVersionIsPending
            ? "PENDING"
            : rolledBackVersionIsWorse
              ? foundVersion.moderationStatus
              : freshProcessingState.moderationStatus,
          moderationUpdatedAt: rolledBackVersionIsPending
            ? null
            : rolledBackVersionIsWorse
              ? (foundVersion.moderationUpdatedAt ?? null)
              : (freshProcessingState.moderationUpdatedAt ?? null),
          moderationSourceVersion: rolledBackVersionIsPending
            ? nextVersion
            : rolledBackVersionIsWorse
              ? nextVersion
              : Number(
                  freshProcessingState.moderationSourceVersion ?? nextVersion,
                ),
          questionEligibilityStatus: "PENDING",
          questionEligibilityUpdatedAt: null,
          questionEligibilitySourceVersion: nextVersion,
          securityVerifierStatus: "NOT_REQUIRED",
          securityVerifierUpdatedAt: null,
          securityVerifierSourceVersion: nextVersion,
          embeddingStatus: "NOT_STARTED",
          similarQuestionsStatus: "NOT_STARTED",
          similarQuestionsComputedAt: null,
          similarQuestionsComputedVersion: null,
        },
        session,
      });

      if (processingStateUpdate.matchedCount !== 1) {
        throw new Error("Question processing state changed during rollback");
      }

      return { nextVersion, createdNewVersion };
    });
  } finally {
    await session.endSession();
  }

  if (!transactionResult) throw new Error("Rollback transaction failed");
  const { nextVersion, createdNewVersion } = transactionResult;

  await getRedisCacheClient().del(
    `question:${questionId}`,
    `v:${version}:question:${questionId}`,
    `v:${nextVersion}:question:${questionId}`,
  );

  await clearQuestionDiscoveryCache();
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
