import { Worker } from "bullmq";
import { fileURLToPath } from "node:url";

import processStatsJob from "../../services/user/worker/stats.service.js";

import connectMongoDB from "../../config/mongodb.config.js";
import { redisMessagingClientConnection } from "../../config/redis.config.js";

import { createWorkerEventHandlers } from "../../utils/workers/shared.js";

const workerFilePath = fileURLToPath(import.meta.url);
const handlers = createWorkerEventHandlers("stats");

async function startStatsWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);
  console.log("Mongo connected, starting stats worker...");

  const worker = new Worker(
    "statsQueue",
    async (job) => {
      await processStatsJob(job.name, job.data);
    },
    {
      connection: redisMessagingClientConnection,
      concurrency: 5,
    },
  );

  worker.on("completed", handlers.completed);
  worker.on("failed", handlers.failed);
  worker.on("error", handlers.error);

  return worker;
}

const isDirectRun = process.argv[1] === workerFilePath;

if (isDirectRun) {
  void startStatsWorker().catch((error) => {
    console.error("Failed to start stats worker:", error);
    process.exit(1);
  });
}

export { startStatsWorker };
