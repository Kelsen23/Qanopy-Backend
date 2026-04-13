import { Worker } from "bullmq";
import { redisMessagingClientConnection } from "../config/redis.config.js";

import convertQuestionToEmbeddingText from "../utils/convertQuestionToEmbeddingText.util.js";
import normalizeText from "../utils/normalizeText.util.js";

import { makeJobId } from "../utils/makeJobId.util.js";

import QuestionVersion from "../models/questionVersion.model.js";
import Question from "../models/question.model.js";

import connectMongoDB from "../config/mongodb.config.js";

import generateEmbedding from "../services/question/generateEmbedding.service.js";

import contentPipelineRouter from "../queues/contentPipelineRouter.queue.js";

import crypto from "crypto";

async function startWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);
  console.log("Mongo connected, starting embedding worker...");

  const worker = new Worker(
    "questionEmbeddingQueue",
    async (job) => {
      const { questionId, version } = job.data;

      const foundQuestionVersion = await QuestionVersion.findOne({
        questionId,
        version,
      }).select("_id title body tags");

      if (!foundQuestionVersion) return;

      const foundQuestion = await Question.findOne({
        _id: questionId,
        currentVersion: version,
        isActive: true,
        isDeleted: false,
        moderationStatus: { $in: ["APPROVED", "FLAGGED"] },
        topicStatus: "VALID",
      }).select("_id embeddingHash embedding embeddingStatus");

      if (!foundQuestion) return;

      const tags = Array.isArray(foundQuestionVersion.tags)
        ? foundQuestionVersion.tags
        : [];

      const text = convertQuestionToEmbeddingText(
        normalizeText(foundQuestionVersion.title as string),
        normalizeText(foundQuestionVersion.body as string),
        tags,
      );

      const newHash = crypto.createHash("sha256").update(text).digest("hex");

      const existingHash = foundQuestion.embeddingHash;

      const shouldRecompute = !existingHash || existingHash !== newHash;

      console.log("Should recompute?:", shouldRecompute);

      if (shouldRecompute) {
        const lockedQuestion = await Question.findOneAndUpdate(
          {
            _id: questionId,
            currentVersion: version,
            isActive: true,
            isDeleted: false,
            moderationStatus: { $in: ["APPROVED", "FLAGGED"] },
            topicStatus: "VALID",
            embeddingStatus: { $in: ["NONE", "PENDING"] },
            $or: [
              { embeddingHash: { $ne: newHash } },
              { embeddingHash: { $exists: false } },
            ],
          },
          {
            $set: { embeddingStatus: "PROCESSING" },
          },
          { new: true },
        );

        if (!lockedQuestion) return;

        const embedding = await generateEmbedding(text);

        const updatedQuestion = await Question.findOneAndUpdate(
          {
            _id: questionId,
            currentVersion: version,
            embeddingStatus: "PROCESSING",
          },
          {
            $set: {
              embedding,
              embeddingHash: newHash,
              embeddingStatus: "READY",
            },
          },
          { new: true },
        );

        if (!updatedQuestion) return;
      }

      await contentPipelineRouter.add(
        "QUESTION",
        {
          contentId: questionId,
          version,
        },
        {
          jobId: makeJobId("contentPipelineRoute", questionId, version),
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
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
  console.error("Failed to start embedding worker:", error);
  process.exit(1);
});
