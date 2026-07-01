import mongoose from "mongoose";

import contextualAnswerService from "../ai/aiAnswer/contextualAnswer.service.js";
import fullAnswerService from "../ai/aiAnswer/fullAnswer.service.js";
import { getAiAnswerCancelKey } from "../../../services/redis/aiAnswerSession.service.js";

import prisma from "../../../config/prisma.config.js";
import { getRedisCacheClient } from "../../../config/redis.config.js";

import HttpError from "../../../utils/http/httpError.util.js";
import publishSocketEvent from "../../../utils/socket/publishSocketEvent.util.js";

import Question from "../../../models/question.model.js";

type ProcessAiAnswerJobData = {
  userId: string;
  questionId: string;
  version: number;
  jobId: string;
};

const processAiAnswerJob = async ({
  userId,
  questionId,
  version,
  jobId,
}: ProcessAiAnswerJobData) => {
  const refundKey = `aiAnswer:refund:${jobId}`;
  const cancelKey = getAiAnswerCancelKey(questionId, version);

  try {
    const foundQuestion = await Question.findById(questionId)
      .select(
        "_id isActive isDeleted currentVersion title body moderationStatus topicStatus embedding embeddingStatus",
      )
      .lean();

    if (!foundQuestion) throw new HttpError("Question not found", 404);

    if (!foundQuestion.isActive || foundQuestion.isDeleted)
      throw new HttpError("Question not active", 410);

    if (foundQuestion.currentVersion !== version) {
      throw new HttpError("Not current version", 409);
    }

    if (
      !["APPROVED", "FLAGGED"].includes(
        String(foundQuestion.moderationStatus),
      ) ||
      foundQuestion.topicStatus !== "VALID"
    ) {
      throw new HttpError("Question is not eligible for AI answer", 400);
    }

    if (
      !Array.isArray(foundQuestion.embedding) ||
      foundQuestion.embedding.length === 0
    ) {
      throw new HttpError("Question does not have embedding", 400);
    }

    if (foundQuestion.embeddingStatus !== "READY") {
      throw new HttpError("Embedding not ready", 409);
    }

    const questionObjectId = new mongoose.Types.ObjectId(questionId);
    await getRedisCacheClient().del(cancelKey);

    const similarQuestions = await Question.aggregate([
      {
        $vectorSearch: {
          index: "semantic_search_vector_index",
          path: "embedding",
          queryVector: foundQuestion.embedding,
          numCandidates: 80,
          limit: 15,
        },
      },
      {
        $project: {
          _id: 1,
          isActive: 1,
          isDeleted: 1,
          topicStatus: 1,
          score: { $meta: "vectorSearchScore" },
        },
      },
      {
        $match: {
          _id: { $ne: questionObjectId },
          isActive: true,
          isDeleted: false,
          topicStatus: "VALID",
        },
      },
      { $limit: 5 },
    ]);

    const similarityThreshold = 0.7;
    const topSimilar = similarQuestions[0];

    if (!topSimilar || topSimilar.score < similarityThreshold) {
      await fullAnswerService(
        userId,
        questionId,
        String(foundQuestion.title ?? ""),
        String(foundQuestion.body ?? ""),
        version,
      );
    } else {
      const similarQuestionIds = similarQuestions.map((s) => String(s._id));

      await contextualAnswerService(
        similarQuestionIds,
        userId,
        questionId,
        String(foundQuestion.title ?? ""),
        String(foundQuestion.body ?? ""),
        version,
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
      await prisma.user.update({
        where: { id: userId },
        data: { credits: { increment: 5 } },
      });

      await getRedisCacheClient().del(`credits:${userId}`, `user:${userId}`);
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

export default processAiAnswerJob;
