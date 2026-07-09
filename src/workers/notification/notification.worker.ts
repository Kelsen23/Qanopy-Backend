import { Worker } from "bullmq";

import processNotificationJob from "../../services/notification/worker/notification.service.js";

import connectMongoDB from "../../config/mongodb.config.js";
import { redisMessagingClientConnection } from "../../config/redis.config.js";

import { createWorkerEventHandlers } from "../../utils/workers/shared.js";

async function startWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);
  console.log("Mongo connected, starting notification worker...");

  const handlers = createWorkerEventHandlers("notification");

  const worker = new Worker(
    "notificationQueue",
    async (job) => {
      await processNotificationJob(job.data);
    },
    {
      connection: redisMessagingClientConnection,
      concurrency: 15,
      limiter: { max: 15, duration: 1000 },
    },
  );

  worker.on("completed", handlers.completed);
  worker.on("failed", handlers.failed);
  worker.on("error", handlers.error);
}

startWorker().catch((error) => {
  console.error("Failed to start notification worker:", error);
  process.exit(1);
});
