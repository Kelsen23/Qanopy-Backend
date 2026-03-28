import { Worker } from "bullmq";

import {
  getRedisCacheClient,
  redisMessagingClientConnection,
} from "../config/redis.config.js";

import { clearVersionHistoryCache } from "../utils/clearCache.util.js";

import HttpError from "../utils/httpError.util.js";
import convertQuestionToText from "../utils/convertQuestionToText.util.js";
import normalizeText from "../utils/normalizeText.util.js";

import mongoose from "mongoose";

import connectMongoDB from "../config/mongodb.config.js";

import QuestionVersion from "../models/questionVersion.model.js";
import Question from "../models/question.model.js";

import generateEmbedding from "../services/question/generateEmbedding.service.js";

async function startWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);
  console.log("Mongo connected, starting question embedding worker...");

  const worker = new Worker(
    "questionEmbeddingQueue",
    async (job) => {
      const { questionId, version, isRollback } = job.data;
      const session = await mongoose.startSession();
      let shouldInvalidateCache = false;

      try {
        if (isRollback) {
          const rolledBackVersion = await QuestionVersion.findOne({
            questionId,
            version,
            topicStatus: "VALID",
          })
            .select("_id basedOnVersion")
            .lean();

          if (!rolledBackVersion)
            throw new HttpError("Question version not found", 404);

          const baseVersion = await QuestionVersion.findOne({
            questionId,
            version: rolledBackVersion.basedOnVersion,
          })
            .select("_id title body embedding")
            .lean();

          if (!baseVersion) throw new HttpError("Base version not found", 404);

          let resolvedEmbedding = Array.isArray(baseVersion.embedding)
            ? baseVersion.embedding
            : [];

          const shouldBackfillBaseEmbedding = resolvedEmbedding.length === 0;

          if (shouldBackfillBaseEmbedding) {
            const questionText = convertQuestionToText(
              normalizeText(baseVersion.title as string),
              normalizeText(baseVersion.body as string),
              [],
              false,
            );

            resolvedEmbedding = await generateEmbedding(questionText);
          }

          await session.withTransaction(async () => {
            const updatedQuestionVersion =
              await QuestionVersion.findByIdAndUpdate(
                rolledBackVersion._id as string,
                { embedding: resolvedEmbedding },
                { new: true, session },
              ).select("isActive");

            if (!updatedQuestionVersion)
              throw new HttpError("Question not found", 404);

            if (shouldBackfillBaseEmbedding) {
              await QuestionVersion.findByIdAndUpdate(
                baseVersion._id as string,
                { embedding: resolvedEmbedding },
                { session },
              );
            }

            await Question.findByIdAndUpdate(
              questionId as string,
              {
                embedding: resolvedEmbedding,
              },
              { session },
            );
          });
          shouldInvalidateCache = true;
        } else {
          const foundQuestionVersion = await QuestionVersion.findOne({
            questionId,
            version,
            topicStatus: "VALID",
          })
            .select("_id title body")
            .lean();

          if (!foundQuestionVersion)
            throw new HttpError("Question version not found", 404);

          const questionText = convertQuestionToText(
            normalizeText(foundQuestionVersion.title as string),
            normalizeText(foundQuestionVersion.body as string),
            [],
            false,
          );

          const embedding = await generateEmbedding(questionText);

          await session.withTransaction(async () => {
            const updatedQuestionVersion =
              await QuestionVersion.findByIdAndUpdate(
                foundQuestionVersion._id as string,
                { embedding },
                { new: true, session },
              ).select("isActive");

            if (!updatedQuestionVersion)
              throw new HttpError("Question not found", 404);

            if (updatedQuestionVersion.isActive)
              await Question.findByIdAndUpdate(
                questionId as string,
                { embedding },
                { session },
              );
          });

          shouldInvalidateCache = true;
        }
      } finally {
        session.endSession();
      }

      if (shouldInvalidateCache) {
        await Promise.all([
          getRedisCacheClient().del(
            `question:${questionId}`,
            `v:${version}:question:${questionId}`,
          ),
          clearVersionHistoryCache(questionId as string),
        ]);
      }
    },
    {
      connection: redisMessagingClientConnection,
      concurrency: 10,
      limiter: { max: 20, duration: 1000 },
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
  console.error("Failed to start question embedding worker:", error);
  process.exit(1);
});
