import HttpError from "../../utils/httpError.util.js";

import mongoose from "mongoose";

import Question from "../../models/question.model.js";
import QuestionVersion from "../../models/questionVersion.model.js";
import topicDeterminationQueue from "../../queues/topicDetermination.queue.js";
import contentModerationQueue from "../../queues/contentModeration.queue.js";

import { getRedisCacheClient } from "../../config/redis.config.js";
import { clearVersionHistoryCache } from "../../utils/clearCache.util.js";

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

  if (foundQuestion.currentVersion <= version)
    throw new HttpError("Cannot rollback to same or newer version", 400);

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

  const { nextVersion, newVersion } = await session.withTransaction(
    async () => {
      const freshQuestion =
        await Question.findById(questionId).session(session);
      if (!freshQuestion) throw new HttpError("Question not found", 404);

      const nextVersion = Number(freshQuestion.currentVersion) + 1;

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

      const [newVersion] = await QuestionVersion.create(
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
          moderationStatus: foundVersion.moderationStatus,
        },
        { session },
      );

      return { nextVersion, newVersion };
    },
  );

  session.endSession();

  await getRedisCacheClient().del(
    `question:${questionId}`,
    `v:${version}:question:${questionId}`,
    `v:${nextVersion}:question:${questionId}`,
  );

  await clearVersionHistoryCache(questionId);

  if (foundVersion.moderationStatus === "PENDING") {
    await contentModerationQueue.add(
      "Question",
      {
        contentId: questionId,
        version: nextVersion,
      },
      { removeOnComplete: true, removeOnFail: false },
    );
  } else {
    await topicDeterminationQueue.add(
      "question",
      {
        questionId,
        version: nextVersion,
        isRollback: true,
      },
      { removeOnComplete: true, removeOnFail: false },
    );
  }

  return {
    message: "Successfully rolled back",
    newVersion: newVersion,
  };
};

export default rollbackVersion;
