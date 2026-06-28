import { Worker } from "bullmq";
import { fileURLToPath } from "node:url";
import { redisMessagingClientConnection } from "../../config/redis.config.js";

import connectMongoDB from "../../config/mongodb.config.js";

import ModActionLog from "../../models/modActionLog.model.js";
import { createWorkerEventHandlers } from "./shared.js";

const workerFilePath = fileURLToPath(import.meta.url);

async function startModerationAuditWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);
  console.log("Mongo connected, starting moderation audit worker...");

  const worker = new Worker(
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

  const handlers = createWorkerEventHandlers("moderationAudit");
  worker.on("completed", handlers.completed);
  worker.on("failed", handlers.failed);
  worker.on("error", handlers.error);

  return worker;
}

const isDirectRun = process.argv[1] === workerFilePath;

if (isDirectRun) {
  void startModerationAuditWorker().catch((error) => {
    console.error("Failed to start moderation audit worker:", error);
    process.exit(1);
  });
}

export { startModerationAuditWorker };
