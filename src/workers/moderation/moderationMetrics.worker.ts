import { Worker } from "bullmq";
import { fileURLToPath } from "node:url";

import processModerationMetricsJob from "../../services/moderation/worker/moderationMetrics.service.js";

import { redisMessagingClientConnection } from "../../config/redis.config.js";

import { createWorkerEventHandlers } from "../../utils/workers/shared.js";

const workerFilePath = fileURLToPath(import.meta.url);

const handlers = createWorkerEventHandlers("moderationMetrics");
const startModerationMetricsWorker = () => {
  const worker = new Worker(
    "moderationMetricsQueue",
    async (job) => {
      await processModerationMetricsJob(job.name, job.data);
    },
    {
      connection: redisMessagingClientConnection,
      concurrency: 10,
      limiter: {
        max: 15,
        duration: 1000,
      },
    },
  );

  worker.on("completed", handlers.completed);
  worker.on("failed", handlers.failed);
  worker.on("error", handlers.error);

  return worker;
};

const isDirectRun = process.argv[1] === workerFilePath;

if (isDirectRun) {
  void startModerationMetricsWorker();
}

export { startModerationMetricsWorker };
