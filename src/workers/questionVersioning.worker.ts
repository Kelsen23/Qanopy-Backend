import { Worker } from "bullmq";
import {
  getRedisCacheClient,
  redisMessagingClientConnection,
} from "../config/redis.config.js";

import connectMongoDB from "../config/mongodb.config.js";

import QuestionVersion from "../models/questionVersion.model.js";

import contentPipelineRouter from "../queues/contentPipelineRouter.queue.js";

async function startWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);
  console.log("Mongo connected, starting question versioning worker...");

  const worker = new Worker(
    "questionVersioningQueue",
    async (job) => {
      const { questionId, userId, title, body, tags } = job.data;
      let { basedOnVersion } = job.data;

      const latestVersion = await QuestionVersion.findOne({ questionId })
        .sort({
          version: -1,
        })
        .lean();

      const nextVersion = latestVersion ? Number(latestVersion.version) + 1 : 1;

      if (!basedOnVersion)
        basedOnVersion = latestVersion ? Number(latestVersion.version) : 1;

      const activeVersion = await QuestionVersion.findOne(
        { questionId, isActive: true },
        { version: 1 },
      ).lean();

      await QuestionVersion.updateMany(
        { questionId, isActive: true },
        { $set: { isActive: false } },
      );

      await QuestionVersion.create({
        questionId,
        userId,
        title,
        body,
        tags,
        version: nextVersion,
        basedOnVersion,
        isActive: true,
        moderationStatus: "PENDING",
        topicStatus: "PENDING",
        embeddingStatus: "NONE",
        embedding: [],
        similarQuestionIds: [],
      });

      await contentPipelineRouter.add(
        "CONTENT_PIPELINE_ROUTE",
        {
          questionId,
          version: nextVersion,
        },
        {
          jobId: `route:${questionId}:${nextVersion}`,
          removeOnComplete: true,
          removeOnFail: false,
        },
      );

      if (activeVersion) {
        await getRedisCacheClient().del(
          `question:${questionId}`,
          `v:${activeVersion.version}:question:${questionId}`,
        );
      }
    },
    { connection: redisMessagingClientConnection, concurrency: 5 },
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
  console.error("Failed to start question versioning worker:", error);
  process.exit(1);
});
