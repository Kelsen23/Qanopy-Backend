import { Worker } from "bullmq";

import processSimilarQuestionsJob from "../../services/question/worker/similarQuestions.service.js";

import connectMongoDB from "../../config/mongodb.config.js";
import { redisMessagingClientConnection } from "../../config/redis.config.js";

import { createWorkerEventHandlers } from "../../utils/workers/shared.js";

async function startWorker() {
  await connectMongoDB(process.env.MONGO_URI as string);
  console.log("Mongo connected, starting similar questions worker...");

  const handlers = createWorkerEventHandlers("similarQuestions");

  const worker = new Worker(
    "similarQuestionsQueue",
    async (job) => {
      await processSimilarQuestionsJob(job.data);
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
  console.error("Failed to start similar questions worker:", error);
  process.exit(1);
});
