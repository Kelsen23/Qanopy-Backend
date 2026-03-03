import { Worker } from "bullmq";
import { redisMessagingClientConnection } from "../config/redis.config.js";

import connectMongoDB from "../config/mongodb.config.js";

import ModActionLog from "../models/modActionLog.model.js";

async function startWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);
  console.log("Mongo connected, starting moderation audit worker...");

  new Worker(
    "moderationAuditQueue",
    async (job) => {
      const {
        decisionId,
        targetType,
        targetId,
        targetUserId,
        actorType,
        adminId,
        actionTaken,
        meta,
      } = job.data;

      await ModActionLog.create({
        decisionId,
        targetType,
        targetId,
        targetUserId,
        actorType,
        adminId,
        actionTaken,
        meta,
      });
    },
    {
      connection: redisMessagingClientConnection,
      concurrency: 15,
      limiter: { max: 15, duration: 1000 },
    },
  );
}

startWorker().catch((error) => {
  console.error("Failed to start stats worker:", error);
  process.exit(1);
});
