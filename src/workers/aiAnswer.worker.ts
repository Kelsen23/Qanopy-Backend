import { Worker } from "bullmq";
import {
  redisMessagingClientConnection,
  getRedisCacheClient,
} from "../config/redis.config.js";

import HttpError from "../utils/httpError.util.js";

import mongoose from "mongoose";

import Question from "../models/question.model.js";

import connectMongoDB from "../config/mongodb.config.js";

import fullAnswerService from "../services/question/aiAnswers/fullAnswer.service.js";
import contextualAnswerService from "../services/question/aiAnswers/contextualAnswer.service.js";

import publishSocketEvent from "../utils/publishSocketEvent.util.js";

async function startWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);
  console.log("Mongo connected, starting ai answer worker...");

  const worker = new Worker(
    "aiAnswerQueue",
    async (job) => {
      const { userId, questionId, version } = job.data;

      try {
        const cachedQuestion = await getRedisCacheClient().get(
          `question:${questionId}`,
        );
        const foundQuestion = cachedQuestion
          ? JSON.parse(cachedQuestion)
          : await Question.findById(questionId).select(
              "_id isActive title body currentVersion embedding",
            );

        if (!foundQuestion.isActive)
          throw new HttpError("Question not active", 400);

        if (
          !Array.isArray(foundQuestion.embedding) ||
          foundQuestion.embedding.length === 0
        )
          throw new HttpError("Question does not have embedding", 400);

        const questionObjectId = new mongoose.Types.ObjectId(
          foundQuestion._id || foundQuestion.id,
        );

        const similarQuestions = await Question.aggregate([
          {
            $vectorSearch: {
              index: "semantic_search_vector_index",
              path: "embedding",
              queryVector: foundQuestion.embedding,
              numCandidates: 80,
              limit: 6,
            },
          },

          { $match: { _id: { $ne: questionObjectId } } },

          { $limit: 5 },

          { $project: { _id: 1, score: { $meta: "vectorSearchScore" } } },
        ]);

        const similarityThreshold = 0.7;
        const topSimilar = similarQuestions[0];

        if (!topSimilar || topSimilar.score < similarityThreshold) {
          await fullAnswerService(
            userId,
            questionId,
            foundQuestion.title,
            foundQuestion.body,
            foundQuestion.currentVersion,
          );
        } else {
          const similarQuestionIds = similarQuestions.map((s) => String(s._id));

          await contextualAnswerService(
            similarQuestionIds,
            userId,
            questionId,
            foundQuestion.title,
            foundQuestion.body,
            foundQuestion.currentVersion,
          );
        }
      } catch (error) {
        const err = error as Error & { statusCode?: number };

        await publishSocketEvent(userId, "aiAnswerFailed", {
          message: err.message,
          statusCode: err.statusCode || 500,
        });

        throw error;
      } finally {
        await getRedisCacheClient().del(
          `aiAnswer:pending:${userId}:${questionId}:${version}`,
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
