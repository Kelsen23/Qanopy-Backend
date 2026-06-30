import { Worker } from "bullmq";
import { fileURLToPath } from "node:url";

import processEmailJob from "../../services/email/worker/email.service.js";

import { redisMessagingClientConnection } from "../../config/redis.config.js";

const workerFilePath = fileURLToPath(import.meta.url);

async function startEmailWorker() {
  const worker = new Worker(
    "emailQueue",
    async (job) => {
      await processEmailJob(job.data);
    },
    {
      connection: redisMessagingClientConnection,
      concurrency: 20,
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
  void startEmailWorker().catch((error) => {
    console.error("Failed to start email worker:", error);
    process.exit(1);
  });
}

export { startEmailWorker };
