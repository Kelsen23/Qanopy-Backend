import { Worker } from "bullmq";
import { redisMessagingClientConnection } from "../config/redis.config.js";

import publishSocketEvent from "../utils/publishSocketEvent.util.js";

import connectMongoDB from "../config/mongodb.config.js";
import notificationModel from "../models/notification.model.js";

async function startWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);
  console.log("Mongo connected, starting notification worker...");

  new Worker(
    "notificationQueue",
    async (job) => {
      const { userId, type, referenceId, meta } = job.data;

      try {
        await notificationModel.create({ userId, type, referenceId, meta });

        publishSocketEvent(userId, "notification", { type, referenceId, meta });
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
}

startWorker().catch((error) => {
  console.error("Failed to start notification worker:", error);
  process.exit(1);
});
