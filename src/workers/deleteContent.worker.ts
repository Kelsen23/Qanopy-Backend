import { Worker } from "bullmq";

import { redisMessagingClientConnection } from "../config/redis.config.js";

import connectMongoDB from "../config/mongodb.config.js";

import deleteContent from "../services/question/deleteContent.service.js";

async function startWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);
  console.log("Mongo connected, starting delete content worker...");

  const worker = new Worker(
    "deleteContentQueue",
    async (job) => {
      const { userId, targetType, targetId } = job.data;

      await deleteContent(userId, targetType.toLowerCase(), targetId);
    },
    {
      connection: redisMessagingClientConnection,
      concurrency: 1,
      limiter: { max: 5, duration: 5000 },
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
  console.error("Failed to start delete content worker:", error);
  process.exit(1);
});
