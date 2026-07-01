import mongoose from "mongoose";

import { getRedisCacheClient } from "../../../../config/redis.config.js";
import prisma from "../../../../config/prisma.config.js";

import HttpError from "../../../../utils/http/httpError.util.js";
import { makeJobId } from "../../../../utils/job/makeJobId.util.js";

import Question from "../../../../models/question.model.js";
import AiAnswer from "../../../../models/aiAnswer.model.js";

import aiAnswerQueue from "../../../../queues/aiAnswer.queue.js";

import { toPublicAiAnswer } from "../../question.response.js";

const generateAiAnswerRequest = async (
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
        .select(
          "_id isActive currentVersion moderationStatus topicStatus embedding",
        )
        .lean();

  if (!foundQuestion) throw new HttpError("Question not found", 404);
  if (!foundQuestion.isActive) throw new HttpError("Question not active", 410);

  if (Number(foundQuestion.currentVersion) !== version)
    throw new HttpError(
      `Stale version. Current version is ${foundQuestion.currentVersion}`,
      409,
    );

  if (!["APPROVED", "FLAGGED"].includes(String(foundQuestion.moderationStatus)))
    throw new HttpError("Question moderation status is not eligible", 400);

  if (foundQuestion.topicStatus !== "VALID")
    throw new HttpError("Question topic is not valid", 400);

  if (
    !Array.isArray(foundQuestion.embedding) ||
    foundQuestion.embedding.length === 0
  )
    throw new HttpError("Question does not have embedding", 400);

  const foundAiAnswer = await AiAnswer.findOne({
    questionId,
    questionVersion: version,
  })
    .sort({ createdAt: -1 })
    .lean();

  if (foundAiAnswer) {
    return {
      message: "AI answer successfully received",
      answer: toPublicAiAnswer(foundAiAnswer),
    };
  }

  const pendingKey = `aiAnswer:pending:${userId}:${questionId}:${version}`;
  const pendingSet = await getRedisCacheClient().set(
    pendingKey,
    "1",
    "EX",
    60 * 15,
    "NX",
  );

  if (!pendingSet) throw new HttpError("AI answer already queued", 409);

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
      "aiAnswer",
      "GENERATE_AI_ANSWER",
      userId,
      questionId,
      version,
    );

    await aiAnswerQueue.remove(jobId);

    await aiAnswerQueue.add(
      "GENERATE_AI_ANSWER",
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

  return { message: "AI answer queued" };
};

export default generateAiAnswerRequest;
