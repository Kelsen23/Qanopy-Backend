import { Worker } from "bullmq";

import {
  getRedisCacheClient,
  redisMessagingClientConnection,
} from "../config/redis.config.js";

import { clearVersionHistoryCache } from "../utils/clearCache.util.js";

import HttpError from "../utils/httpError.util.js";
import convertQuestionToText from "../utils/convertQuestionToText.util.js";
import normalizeText from "../utils/normalizeText.util.js";

import QuestionVersion from "../models/questionVersion.model.js";
import Question from "../models/question.model.js";

import mongoose from "mongoose";

import connectMongoDB from "../config/mongodb.config.js";

import determineTopicStatusService from "../services/question/topicDetermination.service.js";

import questionEmbeddingQueue from "../queues/questionEmbedding.queue.js";

async function startWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);
  console.log("Mongo connected, starting topic determination worker...");

  const worker = new Worker(
    "topicDeterminationQueue",
    async (job) => {
      const { questionId, version, isRollback } = job.data;
      let shouldQueueEmbedding = false;
      let shouldInvalidateCache = false;
      const session = await mongoose.startSession();

      try {
        if (isRollback) {
          const rolledBackVersion = await QuestionVersion.findOne({
            questionId,
            version,
            topicStatus: { $in: ["PENDING", "VALID"] },
          })
            .select("_id basedOnVersion topicStatus")
            .lean();

          if (!rolledBackVersion)
            throw new HttpError("Question version not found", 404);

          const baseVersion = await QuestionVersion.findOne({
            questionId,
            version: rolledBackVersion.basedOnVersion,
          })
            .select("_id title body topicStatus")
            .lean();

          if (!baseVersion) throw new HttpError("Base version not found", 404);

          let resolvedTopicStatus = rolledBackVersion.topicStatus as
            | "PENDING"
            | "VALID"
            | "OFF_TOPIC";

          if (resolvedTopicStatus === "PENDING") {
            const inheritedBaseTopicStatus = baseVersion.topicStatus as
              | "PENDING"
              | "VALID"
              | "OFF_TOPIC";

            resolvedTopicStatus = inheritedBaseTopicStatus;

            if (resolvedTopicStatus === "PENDING") {
              const questionText = convertQuestionToText(
                normalizeText(baseVersion.title as string),
                normalizeText(baseVersion.body as string),
                [],
                false,
              );

              const determinedTopicStatus =
                await determineTopicStatusService(questionText);
              resolvedTopicStatus =
                determinedTopicStatus === "VALID" ? "VALID" : "OFF_TOPIC";
            }
          }

          await session.withTransaction(async () => {
            const updatedQuestionVersion =
              await QuestionVersion.findByIdAndUpdate(
                rolledBackVersion._id as string,
                { topicStatus: resolvedTopicStatus },
                { new: true, session },
              ).select("isActive");

            if (!updatedQuestionVersion)
              throw new HttpError("Question not found", 404);

            if (baseVersion.topicStatus === "PENDING") {
              await QuestionVersion.findByIdAndUpdate(
                baseVersion._id as string,
                { topicStatus: resolvedTopicStatus },
                { session },
              );
            }

            if (updatedQuestionVersion.isActive) {
              await Question.findByIdAndUpdate(
                questionId as string,
                { topicStatus: resolvedTopicStatus },
                { session },
              );
            }

            shouldQueueEmbedding = resolvedTopicStatus === "VALID";
            shouldInvalidateCache = true;
          });
        } else {
          const foundQuestionVersion = await QuestionVersion.findOne({
            questionId,
            version,
            $or: [
              { moderationStatus: "APPROVED" },
              { moderationStatus: "FLAGGED" },
            ],
            topicStatus: "PENDING",
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

          const topicStatus = await determineTopicStatusService(questionText);

          await session.withTransaction(async () => {
            const updatedQuestionVersion =
              await QuestionVersion.findByIdAndUpdate(
                foundQuestionVersion._id as string,
                { topicStatus },
                { new: true, session },
              ).select("isActive");

            if (!updatedQuestionVersion)
              throw new HttpError("Question not found", 404);

            if (updatedQuestionVersion.isActive) {
              await Question.findByIdAndUpdate(
                questionId as string,
                { topicStatus },
                { session },
              );
            }
          });

          shouldQueueEmbedding = topicStatus === "VALID";
          shouldInvalidateCache = true;
        }
      } finally {
        session.endSession();
      }

      if (shouldQueueEmbedding) {
        await questionEmbeddingQueue.add("question", job.data);
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
      concurrency: 5,
      limiter: { max: 10, duration: 1000 },
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
  console.error("Failed to start topic determination worker:", error);
  process.exit(1);
});
