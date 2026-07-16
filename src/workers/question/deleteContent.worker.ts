import { Worker } from "bullmq";

import processDeleteContentJob from "../../services/question/worker/deleteContent.service.js";

import connectMongoDB from "../../config/mongodb.config.js";
import { redisMessagingClientConnection } from "../../config/redis.config.js";

import { createWorkerEventHandlers } from "../../utils/workers/shared.js";

async function startWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);
  console.log("Mongo connected, starting delete content worker...");

  const handlers = createWorkerEventHandlers("deleteContent");

  const worker = new Worker(
    "deleteContentQueue",
    async (job) => {
      const { userId, targetType, targetId } = job.data;
      await processDeleteContentJob(job.name, userId, targetType, targetId);
    },
    {
      connection: redisMessagingClientConnection,
      concurrency: 1,
      limiter: { max: 5, duration: 5000 },
    },
  );

  worker.on("completed", handlers.completed);
  worker.on("failed", handlers.failed);
  worker.on("error", handlers.error);
}

startWorker().catch((error) => {
  console.error("Failed to start delete content worker:", error);
  process.exit(1);
});
