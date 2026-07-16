import { Worker } from "bullmq";

import processSimilarQuestionSearchJob from "../../services/question/worker/similarQuestionSearch.service.js";

import connectMongoDB from "../../config/mongodb.config.js";
import { redisMessagingClientConnection } from "../../config/redis.config.js";

import { createWorkerEventHandlers } from "../../utils/workers/shared.js";

async function startWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);
  console.log("Mongo connected, starting similar question search worker...");

  const handlers = createWorkerEventHandlers("similarQuestionSearch");

  const worker = new Worker(
    "similarQuestionSearchQueue",
    async (job) => {
      await processSimilarQuestionSearchJob(job.data);
    },
    {
      connection: redisMessagingClientConnection,
      concurrency: 5,
      limiter: { max: 10, duration: 1000 },
    },
  );

  worker.on("completed", handlers.completed);
  worker.on("failed", handlers.failed);
  worker.on("error", handlers.error);
}

startWorker().catch((error) => {
  console.error("Failed to start similar question search worker:", error);
  process.exit(1);
});
