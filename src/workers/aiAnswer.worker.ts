import { Worker } from "bullmq";
import {
  redisMessagingClientConnection,
  getRedisCacheClient,
} from "../config/redis.config.js";

import HttpError from "../utils/httpError.util.js";

import publishSocketEvent from "../utils/publishSocketEvent.util.js";

import mongoose from "mongoose";

import Question from "../models/question.model.js";
import QuestionVersion from "../models/questionVersion.model.js";

import connectMongoDB from "../config/mongodb.config.js";

import prisma from "../config/prisma.config.js";

import fullAnswerService from "../services/question/aiAnswers/fullAnswer.service.js";
import contextualAnswerService from "../services/question/aiAnswers/contextualAnswer.service.js";
import { getAiAnswerCancelKey } from "../services/redis/aiAnswerSession.service.js";

async function startWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);
  console.log("Mongo connected, starting ai answer worker...");

  const worker = new Worker(
    "aiAnswerQueue",
    async (job) => {
      const { userId, questionId, version } = job.data;
      const refundKey = `aiAnswer:refund:${job.id}`;
      const cancelKey = getAiAnswerCancelKey(questionId, version);

      try {
        const foundQuestion = await Question.findById(questionId).select(
          "_id isActive isDeleted currentVersion",
        );
        
        if (!foundQuestion) throw new HttpError("Question not found", 404);

        if (!foundQuestion.isActive || foundQuestion.isDeleted)
          throw new HttpError("Question not active", 400);

        const foundQuestionVersion = await QuestionVersion.findOne({
          questionId,
          version,
        })
          .select("_id title body embedding moderationStatus topicStatus")
          .lean();

        if (!foundQuestionVersion)
          throw new HttpError("Question version not found", 404);

        if (
          !["APPROVED", "FLAGGED"].includes(
            String(foundQuestionVersion.moderationStatus),
          ) ||
          foundQuestionVersion.topicStatus !== "VALID"
        ) {
          throw new HttpError(
            "Question version is not eligible for AI answer",
            400,
          );
        }

        if (
          !Array.isArray(foundQuestionVersion.embedding) ||
          foundQuestionVersion.embedding.length === 0
        )
          throw new HttpError("Question version does not have embedding", 400);

        const questionObjectId = new mongoose.Types.ObjectId(questionId);
        await getRedisCacheClient().del(cancelKey);

        const similarQuestions = await Question.aggregate([
          {
            $vectorSearch: {
              index: "semantic_search_vector_index",
              path: "embedding",
              queryVector: foundQuestionVersion.embedding,
              numCandidates: 80,
              limit: 6,
            },
          },

          {
            $match: {
              _id: { $ne: questionObjectId },
              isActive: true,
              isDeleted: false,
              topicStatus: "VALID",
              moderationStatus: { $in: ["APPROVED", "FLAGGED"] },
            },
          },

          { $limit: 5 },

          { $project: { _id: 1, score: { $meta: "vectorSearchScore" } } },
        ]);

        const similarityThreshold = 0.7;
        const topSimilar = similarQuestions[0];

        if (!topSimilar || topSimilar.score < similarityThreshold) {
          await fullAnswerService(
            userId,
            questionId,
            String(foundQuestionVersion.title ?? ""),
            String(foundQuestionVersion.body ?? ""),
            version,
          );
        } else {
          const similarQuestionIds = similarQuestions.map((s) => String(s._id));

          await contextualAnswerService(
            similarQuestionIds,
            userId,
            questionId,
            String(foundQuestionVersion.title ?? ""),
            String(foundQuestionVersion.body ?? ""),
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

          await getRedisCacheClient().del(
            `credits:${userId}`,
            `user:${userId}`,
          );
        }

        await publishSocketEvent(userId, "aiAnswerFailed", {
          message: err.message,
          statusCode: err.statusCode || 500,
        });
        console.log("publishSocketEvent", {
          message: "aiAnswerFailed",
          data: {
            message: err.message,
            statusCode: err.statusCode || 500,
          },
        });

        throw error;
      } finally {
        await getRedisCacheClient().del(
          `aiAnswer:pending:${userId}:${questionId}:${version}`,
          getAiAnswerCancelKey(questionId, version),
        );
      }
    },
    {
      connection: redisMessagingClientConnection,
      concurrency: 2,
      limiter: { max: 2, duration: 1000 },
    },
  );

  worker.on("completed", (job) => {
    console.log(`Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`Job ${job?.id} failed:`, err);
  });

  worker.on("error", (err) => {
    console.error("Worker crashed:", err);
  });
}

startWorker().catch((error) => {
  console.error("Failed to start ai answer worker:", error);
  process.exit(1);
});
