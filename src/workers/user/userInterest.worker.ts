import { Worker } from "bullmq";
import { fileURLToPath } from "node:url";

import processUserInterestJob from "../../services/user/worker/userInterest.service.js";

import connectMongoDB from "../../config/mongodb.config.js";
import { redisMessagingClientConnection } from "../../config/redis.config.js";

import { createWorkerEventHandlers } from "../../utils/workers/shared.js";

const workerFilePath = fileURLToPath(import.meta.url);
const handlers = createWorkerEventHandlers("userInterest");

async function startUserInterestWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);

  const worker = new Worker(
    "userInterestQueue",
    async (job) => {
      await processUserInterestJob(job.name, job.data);
    },
    {
      connection: redisMessagingClientConnection,
      concurrency: 5,
      limiter: { max: 20, duration: 1000 },
    },
  );

  worker.on("completed", handlers.completed);
  worker.on("failed", handlers.failed);
  worker.on("error", handlers.error);

  return worker;
}

const isDirectRun = process.argv[1] === workerFilePath;

if (isDirectRun) {
  void startUserInterestWorker().catch((error) => {
    console.error("Failed to start user interest worker:", error);
    process.exit(1);
  });
}

export { startUserInterestWorker };
