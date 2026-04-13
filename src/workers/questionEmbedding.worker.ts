import { Worker } from "bullmq";
import { redisMessagingClientConnection } from "../config/redis.config.js";

import QuestionVersion from "../models/questionVersion.model.js";
import Question from "../models/question.model.js";

import connectMongoDB from "../config/mongodb.config.js";
import generateEmbedding from "../services/question/generateEmbedding.service.js";

import convertQuestionToEmbeddingText from "../utils/convertQuestionToEmbeddingText.util.js";
import normalizeText from "../utils/normalizeText.util.js";

import { makeJobId } from "../utils/makeJobId.util.js";

import contentPipelineRouter from "../queues/contentPipelineRouter.queue.js";

import crypto from "crypto";

async function startWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);

  const worker = new Worker(
    "questionEmbeddingQueue",
    async (job) => {
      const { questionId, version } = job.data;

      const qv = await QuestionVersion.findOne({ questionId, version })
        .select("title body tags")
        .lean();

      if (!qv) return;

      const locked = await Question.findOneAndUpdate(
        {
          _id: questionId,
          currentVersion: version,
          topicStatus: "VALID",
          embeddingStatus: "NONE", 
        },
        { $set: { embeddingStatus: "PROCESSING" } },
        { new: true },
      );

      if (!locked) return;

      const text = convertQuestionToEmbeddingText(
        normalizeText(qv.title as string),
        normalizeText(qv.body as string),
        Array.isArray(qv.tags) ? qv.tags : [],
      );

      const hash = crypto.createHash("sha256").update(text).digest("hex");

      let embedding = locked.embedding;

      if (
        locked.embeddingHash !== hash ||
        !Array.isArray(embedding) ||
        embedding.length === 0
      ) {
        try {
          embedding = await generateEmbedding(text);
        } catch (err) {
          await Question.updateOne(
            { _id: questionId, currentVersion: version },
            { $set: { embeddingStatus: "NONE" } },
          );
          throw err;
        }
      }

      const updated = await Question.updateOne(
        {
          _id: questionId,
          currentVersion: version,
          embeddingStatus: "PROCESSING",
        },
        {
          $set: {
            embedding,
            embeddingHash: hash,
            embeddingStatus: "READY",
            similarQuestionsStatus: "NONE",
          },
        },
      );

      if (updated.modifiedCount === 0) return;

      await contentPipelineRouter.add(
        "QUESTION",
        { contentId: questionId, version },
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

startWorker().catch((err) => {
  console.error("Failed to start embedding worker:", err);
  process.exit(1);
});
