import mongoose from "mongoose";

import { getRedisCacheClient } from "../../../config/redis.config.js";
import prisma from "../../../config/prisma.config.js";

import HttpError from "../../../utils/http/httpError.util.js";
import { makeJobId } from "../../../utils/job/makeJobId.util.js";

import Question from "../../../models/question.model.js";
import AiSuggestion from "../../../models/aiSuggestion.model.js";

import aiSuggestionQueue from "../../../queues/aiSuggestion.queue.js";

const generateSuggestionRequest = async (
  userId: string,
  questionId: string,
  version: number,
) => {
  if (!mongoose.Types.ObjectId.isValid(questionId))
    throw new HttpError("Invalid questionId", 400);

  const cachedQuestion = await getRedisCacheClient().get(
    `question:${questionId}`,
  );
  const foundQuestion = cachedQuestion
    ? JSON.parse(cachedQuestion)
    : await Question.findOne({
        _id: questionId,
        userId,
      })
        .select("_id isActive currentVersion moderationStatus embedding")
        .lean();

  if (!foundQuestion) throw new HttpError("Question not found", 404);
  if (!foundQuestion.isActive) throw new HttpError("Question not active", 410);

  if (!["APPROVED", "FLAGGED"].includes(String(foundQuestion.moderationStatus)))
    throw new HttpError("Question moderation status is not eligible", 400);

  if (
    !Array.isArray(foundQuestion.embedding) ||
    foundQuestion.embedding.length === 0
  )
    throw new HttpError("Question does not have embedding", 400);

  if (Number(foundQuestion.currentVersion) !== version)
    throw new HttpError(
      `Stale version. Current version is ${foundQuestion.currentVersion}`,
      409,
    );

  const foundAiSuggestion = await AiSuggestion.findOne({
    questionId,
    version,
  })
    .sort({ createdAt: -1 })
    .lean();

  if (foundAiSuggestion) {
    return {
      message: "AI suggestion successfully received",
      suggestion: foundAiSuggestion,
    };
  }

  const pendingKey = `aiSuggestion:pending:${userId}:${questionId}:${version}`;
  const pendingSet = await getRedisCacheClient().set(
    pendingKey,
    "1",
    "EX",
    60 * 15,
    "NX",
  );

  if (!pendingSet) throw new HttpError("AI suggestion already queued", 409);

  const cachedCredits = await getRedisCacheClient().get(`credits:${userId}`);

  if (cachedCredits && JSON.parse(cachedCredits) < 5) {
    await getRedisCacheClient().del(pendingKey);
    throw new HttpError("Not enough credits", 400);
  }

  const updatedUser = await prisma.user.updateMany({
    where: { id: userId, credits: { gte: 5 } },
    data: { credits: { decrement: 5 } },
  });

  if (updatedUser.count === 0) {
    await getRedisCacheClient().del(pendingKey);
    throw new HttpError("Not enough credits", 400);
  }

  await getRedisCacheClient().del(`credits:${userId}`, `user:${userId}`);

  try {
    const jobId = makeJobId(
      "aiSuggestion",
      "GENERATE_SUGGESTION",
      userId,
      questionId,
      version,
    );

    await aiSuggestionQueue.remove(jobId);

    await aiSuggestionQueue.add(
      "GENERATE_SUGGESTION",
      {
        userId,
        questionId,
        version,
      },
      {
        removeOnComplete: true,
        removeOnFail: false,
        jobId,
      },
    );
  } catch (error) {
    await prisma.user.update({
      where: { id: userId },
      data: { credits: { increment: 5 } },
    });

    await getRedisCacheClient().del(
      `credits:${userId}`,
      `user:${userId}`,
      pendingKey,
    );

    throw error;
  }

  return { message: "AI suggestion queued" };
};

export default generateSuggestionRequest;
