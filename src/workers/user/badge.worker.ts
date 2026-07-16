import { Worker } from "bullmq";
import { fileURLToPath } from "node:url";

import processBadgeJob from "../../services/user/worker/badge.service.js";

import { redisMessagingClientConnection } from "../../config/redis.config.js";

import { createWorkerEventHandlers } from "../../utils/workers/shared.js";

const workerFilePath = fileURLToPath(import.meta.url);
const handlers = createWorkerEventHandlers("badge");

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

  worker.on("completed", handlers.completed);
  worker.on("failed", handlers.failed);
  worker.on("error", handlers.error);

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
