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

  new Worker(
    "questionEmbeddingQueue",
    async (job) => {
      const { questionId, version, isRollback } = job.data;
      const session = await mongoose.startSession();
      let shouldInvalidateCache = false;

      try {
        if (isRollback) {
          await session.withTransaction(async () => {
            const rolledBackVersion = await QuestionVersion.findOne({
              questionId,
              version,
              topicStatus: "VALID",
            })
              .select("_id basedOnVersion")
              .session(session)
              .lean();

            if (!rolledBackVersion)
              throw new HttpError("Question version not found", 404);

            const baseVersion = await QuestionVersion.findOne({
              questionId,
              version: rolledBackVersion.basedOnVersion,
            })
              .select("embedding")
              .session(session)
              .lean();

            if (!baseVersion)
              throw new HttpError("Base version not found", 404);

            const updatedQuestionVersion =
              await QuestionVersion.findByIdAndUpdate(
                rolledBackVersion._id as string,
                { embedding: baseVersion.embedding },
                { new: true, session },
              ).select("isActive");

            if (!updatedQuestionVersion)
              throw new HttpError("Question not found", 404);

            await Question.findByIdAndUpdate(
              questionId as string,
              {
                embedding: baseVersion.embedding,
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
}

startWorker().catch((error) => {
  console.error("Failed to start question embedding worker:", error);
  process.exit(1);
});
