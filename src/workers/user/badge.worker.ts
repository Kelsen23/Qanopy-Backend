import { Worker } from "bullmq";
import { fileURLToPath } from "node:url";

import processBadgeJob from "../../services/user/worker/badge.service.js";

import { redisMessagingClientConnection } from "../../config/redis.config.js";

const workerFilePath = fileURLToPath(import.meta.url);

async function startBadgeWorker() {
  console.log("Starting badge worker...");

  const worker = new Worker(
    "badgeQueue",
    async (job) => {
      return processBadgeJob(job.name, job.data);
    },
    {
      connection: redisMessagingClientConnection,
      concurrency: 5,
      limiter: {
        max: 20,
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

  return worker;
}

const isDirectRun = process.argv[1] === workerFilePath;

if (isDirectRun) {
  void startBadgeWorker().catch((error) => {
    console.error("Failed to start badge worker:", error);
    process.exit(1);
  });
}

export { startBadgeWorker };
