import mongoose from "mongoose";

import type { CreditCharge } from "../../../user/credits/credits.types.js";

import { canGetAIAnswer } from "../questionAiHelp.shared.js";
import refundCreditCharge from "../../../user/credits/refundCreditCharge.service.js";
import { toPublicAiAnswer } from "../../question.response.js";

import { getRedisCacheClient } from "../../../../config/redis.config.js";

import HttpError from "../../../../utils/http/httpError.util.js";
import { makeJobId } from "../../../../utils/job/makeJobId.util.js";

import Question from "../../../../models/question.model.js";
import AiAnswer from "../../../../models/aiAnswer.model.js";

import questionAiAnswerQueue from "../../../../queues/questionAiAnswer.queue.js";

const generateAiAnswerRequest = async (
  userId: string,
  questionId: string,
  version: number,
  creditCharge?: CreditCharge,
) => {
  if (!mongoose.Types.ObjectId.isValid(questionId))
    throw new HttpError("Invalid questionId", 400);

  const foundQuestion = await Question.findOne({
    _id: questionId,
    userId,
  })
    .select(
      "_id isActive currentVersion moderationStatus embedding embeddingStatus questionEligibilityStatus securityVerifierStatus",
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

  if (
    !Array.isArray(foundQuestion.embedding) ||
    foundQuestion.embedding.length === 0
  )
    throw new HttpError("Question does not have embedding", 400);

  if (!canGetAIAnswer(foundQuestion))
    throw new HttpError("Question is not eligible for AI answer", 400);

  const foundAiAnswer = await AiAnswer.findOne({
    questionId,
    questionVersion: version,
  })
    .sort({ createdAt: -1 })
    .lean();

  if (foundAiAnswer) {
    if (creditCharge?.chargedNow) {
      await refundCreditCharge({
        operationKey: creditCharge.operationKey,
        reason: "AI answer already existed",
      });
    }

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

  try {
    const jobId = makeJobId(
      "questionAiAnswer",
      "QUESTION_AI_ANSWER",
      userId,
      questionId,
      version,
    );

    await questionAiAnswerQueue.remove(jobId);

    await questionAiAnswerQueue.add(
      "QUESTION_AI_ANSWER",
      {
        userId,
        questionId,
        version,
        creditCharge,
      },
      {
        removeOnComplete: true,
        removeOnFail: false,
        jobId,
      },
    );
  } catch (error) {
    if (creditCharge?.chargedNow) {
      await refundCreditCharge({
        operationKey: creditCharge.operationKey,
        reason: "AI answer queueing failed",
      });
    }

    await getRedisCacheClient().del(`user:${userId}`, pendingKey);

    throw error;
  }

  return { message: "AI answer queued" };
};

export default generateAiAnswerRequest;
