import { Worker } from "bullmq";
import { redisMessagingClientConnection } from "../config/redis.config.js";

import connectMongoDB from "../config/mongodb.config.js";

import Notification from "../models/notification.model.js";

import publishSocketEvent from "../utils/publishSocketEvent.util.js";

import { getUserSockets } from "../services/redis/presence.service.js";

async function startWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);
  console.log("Mongo connected, starting notification worker...");

  const worker = new Worker(
    "notificationQueue",
    async (job) => {
      const { userId, type, referenceId, meta } = job.data;

      const sockets = await getUserSockets(userId);
      const shouldPublishToSocket = sockets.length > 0;

      try {
        await Notification.create({ userId, type, referenceId, meta });

        if (shouldPublishToSocket)
          await publishSocketEvent(userId, "notification", {
            type,
            referenceId,
            meta,
          });
      } catch (error) {
        console.error("Failed to process notification job:", error);
        throw error;
      }
    },
    {
      connection: redisMessagingClientConnection,
      concurrency: 15,
      limiter: { max: 15, duration: 1000 },
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
  console.error("Failed to start notification worker:", error);
  process.exit(1);
});
