import type { CreditCharge } from "../../user/credits/credits.types.js";

import contextualAnswerService from "../ai/aiAnswer/contextualAnswer.service.js";
import fullAnswerService from "../ai/aiAnswer/fullAnswer.service.js";
import { canGetAIAnswer } from "../ai/questionAiHelp.shared.js";
import refundCreditCharge from "../../user/credits/refundCreditCharge.service.js";
import {
  aiAnswerSimilarQuestionResultLimit,
  aiAnswerSimilarQuestionScoreThreshold,
} from "../similarQuestions/similarQuestions.shared.js";
import findSimilarQuestionIds from "../similarQuestions/similarQuestionsSearch.service.js";
import { getAiAnswerCancelKey } from "../../../services/redis/aiAnswerSession.service.js";

import { getRedisCacheClient } from "../../../config/redis.config.js";

import publishSocketEvent from "../../../utils/socket/publishSocketEvent.util.js";

import Question from "../../../models/question.model.js";

type ProcessAiAnswerJobData = {
  userId: string;
  questionId: string;
  version: number;
  jobId: string;
  creditCharge?: CreditCharge;
};

const processQuestionAiAnswerJob = async ({
  userId,
  questionId,
  version,
  jobId,
  creditCharge,
}: ProcessAiAnswerJobData) => {
  const refundKey = `aiAnswer:refund:${jobId}`;
  const cancelKey = getAiAnswerCancelKey(questionId, version);

  try {
    const foundQuestion = await Question.findById(questionId)
      .select(
        "_id isActive isDeleted currentVersion title body moderationStatus embedding embeddingStatus questionEligibilityStatus securityVerifierStatus",
      )
      .lean();

    if (!foundQuestion) throw new Error("Question not found");

    if (!foundQuestion.isActive || foundQuestion.isDeleted)
      throw new Error("Question not active");

    if (foundQuestion.currentVersion !== version) {
      throw new Error("Not current version");
    }

    if (
      !["APPROVED", "FLAGGED"].includes(String(foundQuestion.moderationStatus))
    ) {
      throw new Error("Question is not eligible for AI answer");
    }

    if (
      !Array.isArray(foundQuestion.embedding) ||
      foundQuestion.embedding.length === 0
    ) {
      throw new Error("Question does not have embedding");
    }

    if (foundQuestion.embeddingStatus !== "READY") {
      throw new Error("Embedding not ready");
    }

    if (!canGetAIAnswer(foundQuestion)) {
      throw new Error("Question is not eligible for AI answer");
    }

    await getRedisCacheClient().del(cancelKey);

    const similarQuestionIds = await findSimilarQuestionIds({
      questionId,
      embedding: foundQuestion.embedding,
      resultLimit: aiAnswerSimilarQuestionResultLimit,
      scoreThreshold: aiAnswerSimilarQuestionScoreThreshold,
      numCandidates: 150,
      vectorSearchLimit: 20,
    });

    if (similarQuestionIds.length === 0) {
      await fullAnswerService(
        userId,
        questionId,
        String(foundQuestion.title ?? ""),
        String(foundQuestion.body ?? ""),
        version,
        {
          securityVerifierStatus: foundQuestion.securityVerifierStatus,
        },
      );
    } else {
      await contextualAnswerService(
        similarQuestionIds.map(String),
        userId,
        questionId,
        String(foundQuestion.title ?? ""),
        String(foundQuestion.body ?? ""),
        version,
        {
          securityVerifierStatus: foundQuestion.securityVerifierStatus,
        },
      );
    }
  } catch (error) {
    const err = error as Error & { statusCode?: number };

    const shouldRefund = await getRedisCacheClient().set(
      refundKey,
      "1",
      "EX",
      60 * 60 * 24,
      "NX",
    );

    if (shouldRefund) {
      if (creditCharge?.chargedNow) {
        await refundCreditCharge({
          operationKey: creditCharge.operationKey,
          reason: "AI answer generation failed",
        });
      }
    }

    await publishSocketEvent(userId, "aiAnswerFailed", {
      message: err.message,
      statusCode: err.statusCode || 500,
    });

    throw error;
  } finally {
    await getRedisCacheClient().del(
      `aiAnswer:pending:${userId}:${questionId}:${version}`,
      getAiAnswerCancelKey(questionId, version),
    );
  }
};

export default processQuestionAiAnswerJob;
