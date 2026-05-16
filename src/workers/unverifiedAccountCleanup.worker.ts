import { Worker } from "bullmq";

import { redisMessagingClientConnection } from "../config/redis.config.js";

import unverifiedAccountCleanupQueue from "../queues/unverifiedAccountCleanup.queue.js";
import {
  cleanupAllExpiredUnverifiedUsers,
} from "../services/user/unverifiedAccountCleanup.service.js";

const CLEANUP_JOB_NAME = "CLEANUP_EXPIRED_UNVERIFIED_ACCOUNTS";
const CLEANUP_REPEAT_EVERY_MS = 60 * 60 * 1000;

async function startWorker() {
  const initialCleanedCount = await cleanupAllExpiredUnverifiedUsers();
  console.log("[unverifiedAccountCleanup:init]", { initialCleanedCount });

  await unverifiedAccountCleanupQueue.add(
    CLEANUP_JOB_NAME,
    {},
    {
      repeat: { every: CLEANUP_REPEAT_EVERY_MS },
      removeOnComplete: true,
      removeOnFail: false,
      jobId: "cleanup-expired-unverified-accounts",
    },
  );

  console.log("Starting unverified account cleanup worker...");

  const worker = new Worker(
    "unverifiedAccountCleanupQueue",
    async (job) => {
      if (job.name !== CLEANUP_JOB_NAME) {
        return;
      }

      const cleanedCount = await cleanupAllExpiredUnverifiedUsers();

      console.log("[unverifiedAccountCleanup]", { cleanedCount });

      return cleanedCount;
    },
    {
      connection: redisMessagingClientConnection,
      concurrency: 1,
      limiter: {
        max: 1,
        duration: 1000,
      },
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
  console.error("Failed to start unverified account cleanup worker:", error);
  process.exit(1);
});
