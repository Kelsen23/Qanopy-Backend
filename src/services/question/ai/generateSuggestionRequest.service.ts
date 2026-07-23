import mongoose from "mongoose";

import type { CreditCharge } from "../../user/credits/credits.types.js";

import { canGetAISuggestion } from "./questionAiHelp.shared.js";
import refundCreditCharge from "../../user/credits/refundCreditCharge.service.js";

import { getRedisCacheClient } from "../../../config/redis.config.js";

import HttpError from "../../../utils/http/httpError.util.js";
import { makeJobId } from "../../../utils/job/makeJobId.util.js";

import Question from "../../../models/question.model.js";
import AiSuggestion from "../../../models/aiSuggestion.model.js";

import questionAiSuggestionQueue from "../../../queues/questionAiSuggestion.queue.js";

const generateSuggestionRequest = async (
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
      "_id isActive currentVersion moderationStatus questionEligibilityStatus securityVerifierStatus",
    )
    .lean();

  if (!foundQuestion) throw new HttpError("Question not found", 404);
  if (!foundQuestion.isActive) throw new HttpError("Question not active", 410);

  if (!["APPROVED", "FLAGGED"].includes(String(foundQuestion.moderationStatus)))
    throw new HttpError("Question moderation status is not eligible", 400);

  if (!canGetAISuggestion(foundQuestion))
    throw new HttpError("Question is not eligible for AI suggestion", 400);

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
    if (creditCharge?.chargedNow) {
      await refundCreditCharge({
        operationKey: creditCharge.operationKey,
        reason: "AI suggestion already existed",
      });
    }

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

  try {
    const jobId = makeJobId(
      "questionAiSuggestion",
      "QUESTION_AI_SUGGESTION",
      userId,
      questionId,
      version,
    );

    await questionAiSuggestionQueue.remove(jobId);

    await questionAiSuggestionQueue.add(
      "QUESTION_AI_SUGGESTION",
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
        reason: "AI suggestion queueing failed",
      });
    }

    await getRedisCacheClient().del(`user:${userId}`, pendingKey);

    throw error;
  }

  return { message: "AI suggestion queued" };
};

export default generateSuggestionRequest;
